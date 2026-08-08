import { getSupabaseClient } from "@/auth/supabase";

export type CloudRetentionStatus = "inactive" | "active" | "read_only" | "pending_deletion";

export interface ServerEntitlementState {
  active: boolean;
  hadPro: boolean;
  cloudAccess: boolean;
  expiresAt: string | null;
  checkedAt: string;
  retention: {
    status: CloudRetentionStatus;
    readOnlySince: string | null;
    deleteAfter: string | null;
    uploadsEnabled: boolean;
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parseServerEntitlement(value: unknown): ServerEntitlementState {
  const response = object(value);
  const retention = object(response?.retention);
  const status = retention?.status;
  if (
    typeof response?.active !== "boolean"
    || typeof response.hadPro !== "boolean"
    || typeof response.cloudAccess !== "boolean"
    || !isNullableString(response.expiresAt)
    || typeof response.checkedAt !== "string"
    || !retention
    || !["inactive", "active", "read_only", "pending_deletion"].includes(String(status))
    || !isNullableString(retention.readOnlySince)
    || !isNullableString(retention.deleteAfter)
    || typeof retention.uploadsEnabled !== "boolean"
  ) {
    throw new Error("Buki received an invalid entitlement response.");
  }
  return {
    active: response.active,
    hadPro: response.hadPro,
    cloudAccess: response.cloudAccess,
    expiresAt: nullableString(response.expiresAt),
    checkedAt: response.checkedAt,
    retention: {
      status: status as CloudRetentionStatus,
      readOnlySince: nullableString(retention.readOnlySince),
      deleteAfter: nullableString(retention.deleteAfter),
      uploadsEnabled: retention.uploadsEnabled,
    },
  };
}

export async function verifyServerEntitlement(
  options: { resumeCloudBackup?: boolean } = {},
): Promise<ServerEntitlementState> {
  const { data, error } = await getSupabaseClient().functions.invoke("verify-entitlement", {
    body: options.resumeCloudBackup ? { resumeCloudBackup: true } : {},
  });
  if (error) throw new Error("Buki could not verify cloud access.");
  return parseServerEntitlement(data);
}
