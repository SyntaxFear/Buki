import { getSupabaseClient } from "@/auth/supabase";
import { deleteQueuedMedia, uploadQueuedMedia } from "./media-upload";
import type { SyncEntityType, SyncQueueItem } from "./types";

const TOMBSTONE_TYPE: Partial<Record<SyncEntityType, string>> = {
  child_profile: "child_profile",
  sketchpad: "sketchpad",
  artwork: "artwork",
  tag: "tag",
  media_file: "media_file",
};

const TABLE_NAME: Record<SyncEntityType, string> = {
  adult_profile: "adult_profiles",
  child_profile: "child_profiles",
  sketchpad: "sketchpads",
  artwork: "artworks",
  tag: "tags",
  artwork_tag: "artwork_tags",
  media_file: "media_files",
  sync_device: "sync_devices",
};

const CONFLICT_COLUMNS: Record<SyncEntityType, string> = {
  adult_profile: "owner_id",
  child_profile: "owner_id,id",
  sketchpad: "owner_id,id",
  artwork: "owner_id,id",
  tag: "owner_id,id",
  artwork_tag: "owner_id,artwork_id,tag_id",
  media_file: "owner_id,id",
  sync_device: "owner_id,device_id",
};

class RemoteSyncError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "RemoteSyncError";
  }
}

function payloadFor(item: SyncQueueItem): Record<string, unknown> {
  if (!item.payload) throw new RemoteSyncError(`Missing payload for ${item.entityType}.`, "invalid_payload");
  if (item.payload.owner_id !== item.ownerId) {
    throw new RemoteSyncError("Queued cloud payload does not belong to the active account.", "owner_mismatch");
  }
  return item.payload;
}

function throwIfError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  throw new RemoteSyncError(error.message, error.code);
}

export async function verifyRemoteCloudAccess(): Promise<boolean> {
  const { data, error } = await getSupabaseClient().functions.invoke<{
    active?: boolean;
  }>("verify-entitlement", { body: {} });
  if (error) throw new RemoteSyncError("Buki could not verify cloud access.", "verification_failed");
  return data?.active === true;
}

async function pushUpsert(item: SyncQueueItem): Promise<void> {
  const { error } = await getSupabaseClient()
    .from(TABLE_NAME[item.entityType])
    .upsert(payloadFor(item), { onConflict: CONFLICT_COLUMNS[item.entityType] });
  throwIfError(error);
}

async function pushTombstone(item: SyncQueueItem): Promise<void> {
  const entityType = TOMBSTONE_TYPE[item.entityType];
  if (!entityType) return;
  const payload = payloadFor(item);
  const deletedAt = typeof payload.deleted_at === "string"
    ? payload.deleted_at
    : new Date(item.updatedAt).toISOString();
  const { error } = await getSupabaseClient().from("tombstones").upsert(
    {
      owner_id: item.ownerId,
      entity_type: entityType,
      entity_id: item.entityId,
      deleted_at: deletedAt,
    },
    { onConflict: "owner_id,entity_type,entity_id" },
  );
  throwIfError(error);
}

async function pushDelete(item: SyncQueueItem): Promise<void> {
  const client = getSupabaseClient();
  const payload = payloadFor(item);
  await pushTombstone(item);

  if (item.entityType === "artwork_tag") {
    const artworkId = payload.artwork_id;
    const tagId = payload.tag_id;
    if (typeof artworkId !== "string" || typeof tagId !== "string") {
      throw new RemoteSyncError("Artwork-tag deletion payload is incomplete.", "invalid_payload");
    }
    const { error } = await client
      .from("artwork_tags")
      .delete()
      .eq("owner_id", item.ownerId)
      .eq("artwork_id", artworkId)
      .eq("tag_id", tagId);
    throwIfError(error);
    return;
  }

  if (item.entityType === "adult_profile") {
    throw new RemoteSyncError("Adult profiles are deleted only by account deletion.", "unsupported_delete");
  }

  if (item.entityType === "sync_device") {
    const { error } = await client
      .from("sync_devices")
      .delete()
      .eq("owner_id", item.ownerId)
      .eq("device_id", item.entityId);
    throwIfError(error);
    return;
  }

  const { error } = await client
    .from(TABLE_NAME[item.entityType])
    .delete()
    .eq("owner_id", item.ownerId)
    .eq("id", item.entityId);
  throwIfError(error);
}

export async function pushRemoteSyncItem(item: SyncQueueItem): Promise<void> {
  if (item.entityType === "media_file") {
    payloadFor(item);
    if (item.operation === "upsert") await uploadQueuedMedia(item);
    else await deleteQueuedMedia(item);
    return;
  }
  if (item.operation === "upsert") await pushUpsert(item);
  else await pushDelete(item);
}
