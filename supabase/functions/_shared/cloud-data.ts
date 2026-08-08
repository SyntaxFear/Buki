import type { SupabaseClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "buki-media";
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;
const MAX_STORAGE_DEPTH = 8;
// Supabase signed upload URLs last two hours; keep sweeping beyond expiry for clock/race safety.
const SIGNED_UPLOAD_EXPIRY_BUFFER_MS = 135 * 60 * 1000;

export type StorageDeletionReason =
  | "cloud_copy_removal"
  | "account_deletion"
  | "retention_expiry";

export async function queueOwnerStorageSweep(
  admin: SupabaseClient,
  ownerId: string,
  reason: StorageDeletionReason,
): Promise<void> {
  const now = new Date();
  const finalSweepAfter = new Date(
    now.valueOf() + SIGNED_UPLOAD_EXPIRY_BUFFER_MS,
  );
  const result = await admin.from("storage_deletion_sweeps").upsert({
    owner_id: ownerId,
    reason,
    started_at: now.toISOString(),
    final_sweep_after: finalSweepAfter.toISOString(),
    next_attempt_at: now.toISOString(),
    attempts: 0,
    last_error: null,
    updated_at: now.toISOString(),
  });
  if (result.error) throw new Error("storage_deletion_sweep_queue_failed");
}

async function storagePathsFromTable(
  admin: SupabaseClient,
  table: "media_files" | "media_upload_reservations",
  ownerId: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const result = await admin
      .from(table)
      .select("storage_path")
      .eq("owner_id", ownerId)
      .order("storage_path", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(`${table}_path_lookup_failed`);
    const page = (result.data ?? []) as { storage_path: string | null }[];
    for (const row of page) {
      if (row.storage_path?.startsWith(`${ownerId}/`)) {
        paths.push(row.storage_path);
      }
    }
    if (page.length < PAGE_SIZE) return paths;
  }
}

export async function removeOwnerStorageObjects(
  admin: SupabaseClient,
  ownerId: string,
): Promise<number> {
  const paths = new Set([
    ...await storagePathsFromTable(admin, "media_files", ownerId),
    ...await storagePathsFromTable(admin, "media_upload_reservations", ownerId),
  ]);
  const bucket = admin.storage.from(MEDIA_BUCKET);

  async function collect(prefix: string, depth: number): Promise<void> {
    if (depth > MAX_STORAGE_DEPTH) {
      throw new Error("media_storage_depth_exceeded");
    }
    for (let offset = 0;; offset += PAGE_SIZE) {
      const result = await bucket.list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (result.error) throw new Error("media_object_list_failed");
      const page = result.data ?? [];
      for (const item of page) {
        const path = `${prefix}/${item.name}`;
        if (item.id === null) await collect(path, depth + 1);
        else paths.add(path);
      }
      if (page.length < PAGE_SIZE) break;
    }
  }

  await collect(ownerId, 0);
  const ordered = [...paths].sort();
  for (let offset = 0; offset < ordered.length; offset += DELETE_BATCH_SIZE) {
    const result = await bucket.remove(
      ordered.slice(offset, offset + DELETE_BATCH_SIZE),
    );
    if (result.error) throw new Error("media_object_delete_failed");
  }
  return ordered.length;
}

export async function purgeOwnerCloudContent(
  admin: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const { error } = await admin.rpc("purge_buki_cloud_content", {
    target_owner: ownerId,
  });
  if (error) {
    console.error("purge_buki_cloud_content failed", { code: error.code });
    throw new Error("cloud_content_purge_failed");
  }
}
