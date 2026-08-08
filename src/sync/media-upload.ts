import {
  loadBukiLocalMedia,
  markBukiMediaFailed,
  markBukiMediaUploaded,
  markBukiMediaUploading,
  saveBukiCloudUsage,
} from "@/database";
import { getSupabaseClient } from "@/auth/supabase";
import type { SyncQueueItem } from "./types";
import { MissingMediaSourceError, prepareMediaUpload } from "./media-transform";

const MEDIA_BUCKET = "buki-media";
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

interface MediaUploadResult {
  path: string;
  checksum: string;
  byteSize: number;
  mimeType: string;
  bytesUsed: number;
  bytesLimit: number;
}

type CreateUploadResponse =
  | {
      deduplicated: true;
      path: string;
      byteSize: number;
      mimeType: string;
      bytesUsed: number;
      bytesLimit: number;
    }
  | {
      deduplicated: false;
      reservationId: string;
      path: string;
      token: string;
      bytesUsed: number;
      bytesLimit: number;
    };

export class CloudMediaError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly bytesUsed?: number,
    readonly bytesLimit?: number,
  ) {
    super(message);
    this.name = "CloudMediaError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value) throw new CloudMediaError("Buki received an invalid cloud response.", code);
  return value;
}

function requiredNumber(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CloudMediaError("Buki received an invalid cloud response.", code);
  }
  return value;
}

async function edgeErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  const context = record(error)?.context;
  if (!context || typeof (context as Response).clone !== "function") return null;
  try {
    return record(await (context as Response).clone().json());
  } catch {
    return null;
  }
}

async function invokeEdge(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseClient().functions.invoke(functionName, { body });
  if (error) {
    const details = await edgeErrorBody(error);
    const code = typeof details?.error === "string" ? details.error : null;
    if (code === "cloud_quota_exceeded") {
      throw new CloudMediaError(
        "Buki cloud storage is full. Local artwork is still safe.",
        code,
        typeof details?.bytesUsed === "number" ? details.bytesUsed : undefined,
        typeof details?.bytesLimit === "number" ? details.bytesLimit : undefined,
      );
    }
    if (code === "cloud_access_required") {
      throw new CloudMediaError("Buki Pro cloud access is required to upload artwork.", code);
    }
    throw new CloudMediaError("Buki could not finish the cloud media request.", code ?? "edge_request_failed");
  }
  const response = record(data);
  if (!response) throw new CloudMediaError("Buki received an invalid cloud response.", "invalid_response");
  return response;
}

function createUploadResponse(value: Record<string, unknown>): CreateUploadResponse {
  const bytesUsed = requiredNumber(value.bytesUsed, "invalid_usage");
  const bytesLimit = requiredNumber(value.bytesLimit, "invalid_usage");
  if (value.deduplicated === true) {
    return {
      deduplicated: true,
      path: requiredString(value.path, "invalid_path"),
      byteSize: requiredNumber(value.byteSize, "invalid_size"),
      mimeType: requiredString(value.mimeType, "invalid_mime"),
      bytesUsed,
      bytesLimit,
    };
  }
  if (value.deduplicated !== false) {
    throw new CloudMediaError("Buki received an invalid cloud response.", "invalid_deduplication_state");
  }
  return {
    deduplicated: false,
    reservationId: requiredString(value.reservationId, "invalid_reservation"),
    path: requiredString(value.path, "invalid_path"),
    token: requiredString(value.token, "invalid_token"),
    bytesUsed,
    bytesLimit,
  };
}

function completedUploadResponse(value: Record<string, unknown>): MediaUploadResult {
  return {
    path: requiredString(value.path, "invalid_path"),
    checksum: requiredString(value.checksum, "invalid_checksum"),
    byteSize: requiredNumber(value.byteSize, "invalid_size"),
    mimeType: requiredString(value.mimeType, "invalid_mime"),
    bytesUsed: requiredNumber(value.bytesUsed, "invalid_usage"),
    bytesLimit: requiredNumber(value.bytesLimit, "invalid_usage"),
  };
}

async function persistUpload(
  ownerId: string,
  mediaId: string,
  result: MediaUploadResult,
): Promise<void> {
  await markBukiMediaUploaded({
    ownerId,
    mediaId,
    remotePath: result.path,
    checksum: result.checksum,
    byteSize: result.byteSize,
    mimeType: result.mimeType,
  });
  await saveBukiCloudUsage(ownerId, result.bytesUsed, result.bytesLimit);
}

export async function uploadQueuedMedia(item: SyncQueueItem): Promise<void> {
  const media = await loadBukiLocalMedia(item.ownerId, item.entityId);
  if (!media) return;
  if (media.uploadState === "uploaded" && media.remotePath && media.checksum) return;

  await markBukiMediaUploading(item.ownerId, item.entityId);
  let prepared: Awaited<ReturnType<typeof prepareMediaUpload>>;
  try {
    prepared = await prepareMediaUpload(media);
  } catch (error) {
    const missing = error instanceof MissingMediaSourceError;
    await markBukiMediaFailed(item.ownerId, item.entityId, missing);
    if (missing) return;
    throw error;
  }

  try {
    if (prepared.byteSize > MAX_MEDIA_BYTES) {
      throw new CloudMediaError("This artwork image is too large for Buki cloud backup.", "media_too_large");
    }
    const created = createUploadResponse(await invokeEdge("create-media-upload", {
      mediaId: media.id,
      artworkId: media.artworkId,
      kind: media.kind,
      checksum: prepared.checksum,
      byteSize: prepared.byteSize,
      mimeType: prepared.mimeType,
    }));

    if (created.deduplicated) {
      await persistUpload(item.ownerId, item.entityId, {
        path: created.path,
        checksum: prepared.checksum,
        byteSize: created.byteSize,
        mimeType: created.mimeType,
        bytesUsed: created.bytesUsed,
        bytesLimit: created.bytesLimit,
      });
      return;
    }

    const uploaded = await getSupabaseClient().storage
      .from(MEDIA_BUCKET)
      .uploadToSignedUrl(created.path, created.token, prepared.bytes, {
        contentType: prepared.mimeType,
        cacheControl: "31536000",
      });
    if (uploaded.error) {
      throw new CloudMediaError("Buki could not upload this artwork image.", "storage_upload_failed");
    }
    const completed = completedUploadResponse(await invokeEdge("complete-media-upload", {
      reservationId: created.reservationId,
    }));
    await persistUpload(item.ownerId, item.entityId, completed);
  } catch (error) {
    if (
      error instanceof CloudMediaError
      && typeof error.bytesUsed === "number"
      && typeof error.bytesLimit === "number"
    ) {
      await saveBukiCloudUsage(item.ownerId, error.bytesUsed, error.bytesLimit);
    }
    await markBukiMediaFailed(item.ownerId, item.entityId, false);
    throw error;
  } finally {
    prepared.cleanup();
  }
}

export function isCloudQuotaError(error: unknown): boolean {
  return error instanceof CloudMediaError && error.code === "cloud_quota_exceeded";
}

export async function deleteQueuedMedia(item: SyncQueueItem): Promise<void> {
  const payload = item.payload ?? {};
  const response = await invokeEdge("delete-media", {
    mediaId: item.entityId,
    deletedAt: typeof payload.deleted_at === "string"
      ? payload.deleted_at
      : new Date(item.updatedAt).toISOString(),
  });
  await saveBukiCloudUsage(
    item.ownerId,
    requiredNumber(response.bytesUsed, "invalid_usage"),
    requiredNumber(response.bytesLimit, "invalid_usage"),
  );
}
