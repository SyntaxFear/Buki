import { getSupabaseClient } from "@/auth/supabase";
import { resetBukiCloudState } from "@/database";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function edgeErrorCode(error: unknown): Promise<string | null> {
  const context = object(error)?.context;
  if (!context || typeof (context as Response).clone !== "function") return null;
  try {
    const body = object(await (context as Response).clone().json());
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

async function invokePrivacyFunction(name: string): Promise<void> {
  const { data, error } = await getSupabaseClient().functions.invoke(name, { body: {} });
  if (error) {
    const code = await edgeErrorCode(error);
    throw new Error(code === "invalid_session"
      ? "Please sign in again before changing account data."
      : "Buki could not complete this privacy request. Please try again.");
  }
  if (object(data)?.deleted !== true) {
    throw new Error("Buki received an invalid privacy response.");
  }
}

export async function removeBukiCloudCopies(ownerId: string): Promise<void> {
  await invokePrivacyFunction("delete-cloud-data");
  await resetBukiCloudState(ownerId);
}

export async function requestBukiAccountDeletion(): Promise<void> {
  await invokePrivacyFunction("request-account-deletion");
}
