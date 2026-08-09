import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "HttpError";
  }
}

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export async function authenticatedClients(request: Request): Promise<{
  user: User;
  admin: SupabaseClient;
}> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "missing_authorization");

  const supabaseUrl = requiredSecret("SUPABASE_URL");
  const anonKey = requiredSecret("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new HttpError(401, "invalid_session");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { user, admin };
}

export async function requestObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "invalid_request");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_json");
  }
}

export function assertExpectedOwner(
  body: Record<string, unknown>,
  authenticatedOwnerId: string,
): void {
  const expectedOwnerId = body.ownerId;
  if (expectedOwnerId === undefined) return;
  if (typeof expectedOwnerId !== "string" || !expectedOwnerId || expectedOwnerId.length > 128) {
    throw new HttpError(400, "invalid_ownerId");
  }
  if (expectedOwnerId !== authenticatedOwnerId) {
    throw new HttpError(409, "account_session_changed");
  }
}

export function handleError(error: unknown, operation: string): Response {
  if (error instanceof HttpError) return json(error.status, { error: error.code });
  console.error(`${operation} failed`, error instanceof Error ? error.message : "unknown_error");
  return json(503, { error: `${operation}_unavailable` });
}
