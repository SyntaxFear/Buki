import type { SupabaseClient } from "@supabase/supabase-js";

import { requiredSecret } from "./buki.ts";

const REVENUECAT_API_ORIGIN = "https://api.revenuecat.com";
const REVENUECAT_API_BASE = `${REVENUECAT_API_ORIGIN}/v2`;
const PRO_ENTITLEMENT_LOOKUP_KEY = "pro";

type RevenueCatEntitlement = {
  id: string;
  lookup_key: string;
  state: "active" | "inactive";
};

type RevenueCatActiveEntitlement = {
  entitlement_id: string;
  expires_at: number | null;
};

type RevenueCatAttachedEntitlement = {
  id?: string;
  lookup_key?: string;
};

export type RevenueCatHistoricalAccess = {
  id: string;
  entitlements?: {
    items?: RevenueCatAttachedEntitlement[];
  };
};

type RevenueCatList<T> = {
  items?: T[];
  next_page?: string | null;
};

export function historyItemsContainPro(
  items: readonly RevenueCatHistoricalAccess[],
  entitlementId: string,
): boolean {
  return items.some((item) =>
    item.entitlements?.items?.some((entitlement) =>
      entitlement.id === entitlementId ||
      entitlement.lookup_key === PRO_ENTITLEMENT_LOOKUP_KEY
    )
  );
}

export type RevenueCatVerification = {
  active: boolean;
  hadPro: boolean;
  expiresAt: string | null;
  checkedAt: string;
};

let cachedProEntitlementId: string | null = null;

export function revenueCatPagePath(path: string): string {
  const candidate = path.startsWith("/projects/") ? `/v2${path}` : path;
  const url = new URL(candidate, `${REVENUECAT_API_ORIGIN}/`);
  if (
    url.origin !== REVENUECAT_API_ORIGIN ||
    !url.pathname.startsWith("/v2/projects/")
  ) {
    throw new Error("RevenueCat pagination URL was invalid.");
  }
  return `${url.pathname.slice(3)}${url.search}`;
}

async function revenueCatRequest(path: string): Promise<Response> {
  return fetch(`${REVENUECAT_API_BASE}${revenueCatPagePath(path)}`, {
    headers: {
      Authorization: `Bearer ${requiredSecret("REVENUECAT_SECRET_API_KEY")}`,
      Accept: "application/json",
    },
  });
}

async function findRevenueCatListItem<T>(
  initialPath: string,
  operation: string,
  predicate: (item: T) => boolean,
  allowNotFound = false,
): Promise<T | null> {
  let pagePath = initialPath;
  const visited = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const normalizedPath = revenueCatPagePath(pagePath);
    if (visited.has(normalizedPath)) {
      throw new Error(`RevenueCat ${operation} pagination looped.`);
    }
    visited.add(normalizedPath);

    const upstream = await revenueCatRequest(normalizedPath);
    if (upstream.status === 404 && allowNotFound) {
      await upstream.body?.cancel();
      return null;
    }
    if (!upstream.ok) return revenueCatError(upstream, operation);
    const payload = await upstream.json() as RevenueCatList<T>;
    const items = Array.isArray(payload.items) ? payload.items : [];
    const matched = items.find(predicate);
    if (matched) return matched;
    if (!payload.next_page) return null;
    pagePath = payload.next_page;
  }
  throw new Error(`RevenueCat ${operation} exceeded the safe page limit.`);
}

async function revenueCatError(
  upstream: Response,
  operation: string,
): Promise<never> {
  await upstream.body?.cancel();
  console.error(`RevenueCat ${operation} failed`, { status: upstream.status });
  throw new Error(
    `RevenueCat ${operation} failed with status ${upstream.status}`,
  );
}

async function proEntitlementId(projectId: string): Promise<string> {
  if (cachedProEntitlementId) return cachedProEntitlementId;
  const entitlement = await findRevenueCatListItem<RevenueCatEntitlement>(
    `/projects/${encodeURIComponent(projectId)}/entitlements?limit=100`,
    "entitlement lookup",
    (item) =>
      item.lookup_key === PRO_ENTITLEMENT_LOOKUP_KEY && item.state === "active",
  );
  if (!entitlement) {
    throw new Error("RevenueCat does not have an active pro entitlement.");
  }
  cachedProEntitlementId = entitlement.id;
  return entitlement.id;
}

async function activeProEntitlement(
  projectId: string,
  customerId: string,
  entitlementId: string,
): Promise<RevenueCatActiveEntitlement | null> {
  return findRevenueCatListItem<RevenueCatActiveEntitlement>(
    `/projects/${encodeURIComponent(projectId)}/customers/${
      encodeURIComponent(customerId)
    }/active_entitlements?limit=100`,
    "customer verification",
    (item) => item.entitlement_id === entitlementId,
    true,
  );
}

async function historyContainsPro(
  projectId: string,
  customerId: string,
  resource: "subscriptions" | "purchases",
  entitlementId: string,
): Promise<boolean> {
  return await findRevenueCatListItem<RevenueCatHistoricalAccess>(
    `/projects/${encodeURIComponent(projectId)}/customers/${
      encodeURIComponent(customerId)
    }/${resource}?limit=100`,
    `${resource} history lookup`,
    (item) => historyItemsContainPro([item], entitlementId),
    true,
  ) !== null;
}

async function customerHadPro(
  projectId: string,
  customerId: string,
  entitlementId: string,
): Promise<boolean> {
  const results = await Promise.allSettled([
    historyContainsPro(projectId, customerId, "subscriptions", entitlementId),
    historyContainsPro(projectId, customerId, "purchases", entitlementId),
  ]);
  if (results.some((result) => result.status === "fulfilled" && result.value)) {
    return true;
  }
  const failed = results.find((result): result is PromiseRejectedResult =>
    result.status === "rejected"
  );
  if (failed) throw failed.reason;
  return false;
}

export async function verifyRevenueCatPro(
  customerId: string,
): Promise<RevenueCatVerification> {
  const projectId = requiredSecret("REVENUECAT_PROJECT_ID");
  const entitlementId = await proEntitlementId(projectId);
  const entitlement = await activeProEntitlement(
    projectId,
    customerId,
    entitlementId,
  );
  const checkedAt = new Date();
  const expiresAt = entitlement?.expires_at
    ? new Date(entitlement.expires_at)
    : null;
  const active = Boolean(
    entitlement && (!expiresAt || expiresAt.valueOf() > checkedAt.valueOf()),
  );
  return {
    active,
    hadPro: Boolean(entitlement) ||
      await customerHadPro(projectId, customerId, entitlementId),
    expiresAt: expiresAt?.toISOString() ?? null,
    checkedAt: checkedAt.toISOString(),
  };
}

export async function persistRevenueCatVerification(
  admin: SupabaseClient,
  ownerId: string,
  verification: RevenueCatVerification,
): Promise<void> {
  const { error } = await admin.rpc("record_entitlement_verification", {
    target_owner: ownerId,
    entitlement_active: verification.active,
    entitlement_had_pro: verification.hadPro,
    entitlement_expires_at: verification.expiresAt,
    verified_at: verification.checkedAt,
  });
  if (error) {
    console.error("Could not store entitlement verification", {
      code: error.code,
    });
    throw new Error("verification_persistence_failed");
  }
}

export { PRO_ENTITLEMENT_LOOKUP_KEY };
