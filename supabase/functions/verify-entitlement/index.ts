import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "@supabase/supabase-js";

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v2";
const PRO_ENTITLEMENT_LOOKUP_KEY = "pro";
const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

type RevenueCatEntitlement = {
  id: string;
  lookup_key: string;
  state: "active" | "inactive";
};

type RevenueCatActiveEntitlement = {
  entitlement_id: string;
  expires_at: number | null;
};

let cachedProEntitlementId: string | null = null;

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

async function revenueCatRequest(path: string): Promise<Response> {
  const secret = requiredSecret("REVENUECAT_SECRET_API_KEY");
  return fetch(`${REVENUECAT_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  });
}

async function revenueCatError(upstream: Response, operation: string): Promise<never> {
  await upstream.body?.cancel();
  console.error(`RevenueCat ${operation} failed`, { status: upstream.status });
  throw new Error(`RevenueCat ${operation} failed with status ${upstream.status}`);
}

async function proEntitlementId(projectId: string): Promise<string> {
  if (cachedProEntitlementId) return cachedProEntitlementId;
  const upstream = await revenueCatRequest(`/projects/${encodeURIComponent(projectId)}/entitlements?limit=100`);
  if (!upstream.ok) return revenueCatError(upstream, "entitlement lookup");
  const payload = await upstream.json() as { items?: RevenueCatEntitlement[] };
  const entitlement = payload.items?.find(
    (item) => item.lookup_key === PRO_ENTITLEMENT_LOOKUP_KEY && item.state === "active",
  );
  if (!entitlement) throw new Error("RevenueCat does not have an active pro entitlement.");
  cachedProEntitlementId = entitlement.id;
  return entitlement.id;
}

async function activeProEntitlement(
  projectId: string,
  customerId: string,
): Promise<RevenueCatActiveEntitlement | null> {
  const entitlementId = await proEntitlementId(projectId);
  const upstream = await revenueCatRequest(
    `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(customerId)}/active_entitlements?limit=100`,
  );
  if (upstream.status === 404) return null;
  if (!upstream.ok) return revenueCatError(upstream, "customer verification");
  const payload = await upstream.json() as { items?: RevenueCatActiveEntitlement[] };
  return payload.items?.find((item) => item.entitlement_id === entitlementId) ?? null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return response(401, { error: "missing_authorization" });

    const supabaseUrl = requiredSecret("SUPABASE_URL");
    const anonKey = requiredSecret("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const projectId = requiredSecret("REVENUECAT_PROJECT_ID");

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return response(401, { error: "invalid_session" });

    const entitlement = await activeProEntitlement(projectId, user.id);
    const checkedAt = new Date();
    const expiresAt = entitlement?.expires_at ? new Date(entitlement.expires_at) : null;
    const entitlementActive = Boolean(
      entitlement && (!expiresAt || expiresAt.valueOf() > checkedAt.valueOf()),
    );

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: snapshotError } = await admin.rpc("record_entitlement_verification", {
      target_owner: user.id,
      entitlement_active: entitlementActive,
      entitlement_expires_at: expiresAt?.toISOString() ?? null,
      verified_at: checkedAt.toISOString(),
    });
    if (snapshotError) {
      console.error("Could not store entitlement verification", snapshotError);
      return response(500, { error: "verification_persistence_failed" });
    }

    return response(200, {
      active: entitlementActive,
      entitlement: PRO_ENTITLEMENT_LOOKUP_KEY,
      expiresAt: expiresAt?.toISOString() ?? null,
      checkedAt: checkedAt.toISOString(),
    });
  } catch (error) {
    console.error("verify-entitlement failed", error);
    return response(503, { error: "entitlement_verification_unavailable" });
  }
});
