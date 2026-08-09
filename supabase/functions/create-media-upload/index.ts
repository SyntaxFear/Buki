import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  assertExpectedOwner,
  authenticatedClients,
  handleError,
  HttpError,
  json,
  requestObject,
} from "../_shared/buki.ts";
import { CREATE_ONLY_SIGNED_UPLOAD_OPTIONS } from "../_shared/signed-upload.ts";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

type ReservationRow = {
  result: "reserved" | "deduplicated" | "quota_exceeded";
  reservation_id: string | null;
  deduplicated: boolean;
  storage_path: string | null;
  stored_bytes: number;
  stored_mime_type: string;
  bytes_used: number;
  bytes_limit: number;
};

function stringField(body: Record<string, unknown>, name: string, maxLength: number): string {
  const value = body[name];
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new HttpError(400, `invalid_${name}`);
  }
  return value;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const { user, admin } = await authenticatedClients(request);
    const body = await requestObject(request);
    assertExpectedOwner(body, user.id);
    const mediaId = stringField(body, "mediaId", 240);
    const artworkId = stringField(body, "artworkId", 200);
    const kind = stringField(body, "kind", 20);
    const checksum = stringField(body, "checksum", 64).toLowerCase();
    const mimeType = stringField(body, "mimeType", 50);
    const byteSize = body.byteSize;
    if (!Number.isSafeInteger(byteSize) || (byteSize as number) <= 0) {
      throw new HttpError(400, "invalid_byteSize");
    }
    const extension = MIME_EXTENSION[mimeType];
    if (!extension) throw new HttpError(400, "invalid_mimeType");
    if (!/^[0-9a-f]{64}$/.test(checksum)) throw new HttpError(400, "invalid_checksum");
    if (!/^(cutout|preview|original)$/.test(kind)) throw new HttpError(400, "invalid_kind");

    const safeMediaId = mediaId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
    const storagePath = `${user.id}/${checksum.slice(0, 2)}/${checksum}/${kind}-${safeMediaId}.${extension}`;
    const { data, error } = await admin.rpc("reserve_media_upload", {
      target_owner: user.id,
      target_media_id: mediaId,
      target_artwork_id: artworkId,
      target_kind: kind,
      target_checksum: checksum,
      requested_bytes: byteSize,
      target_mime_type: mimeType,
      target_storage_path: storagePath,
    });
    if (error) {
      if (error.message.includes("cloud_access_required")) throw new HttpError(403, "cloud_access_required");
      if (error.message.includes("upload_cleanup_pending")) {
        throw new HttpError(409, "upload_cleanup_pending");
      }
      if (error.message.includes("upload_reservation_conflict")) {
        throw new HttpError(409, "upload_reservation_conflict");
      }
      console.error("reserve_media_upload failed", { code: error.code });
      throw new Error("reservation_failed");
    }
    const reservation = (data as ReservationRow[] | null)?.[0];
    if (!reservation) throw new Error("reservation_missing");
    if (reservation.result === "quota_exceeded") {
      return json(409, {
        error: "cloud_quota_exceeded",
        bytesUsed: reservation.bytes_used,
        bytesLimit: reservation.bytes_limit,
      });
    }
    if (reservation.deduplicated) {
      return json(200, {
        deduplicated: true,
        path: reservation.storage_path,
        byteSize: reservation.stored_bytes,
        mimeType: reservation.stored_mime_type,
        bytesUsed: reservation.bytes_used,
        bytesLimit: reservation.bytes_limit,
      });
    }
    if (!reservation.reservation_id || !reservation.storage_path) throw new Error("invalid_reservation");

    const signed = await admin.storage
      .from("buki-media")
      .createSignedUploadUrl(reservation.storage_path, CREATE_ONLY_SIGNED_UPLOAD_OPTIONS);
    if (signed.error || !signed.data) {
      await admin.rpc("release_media_upload_reservation", {
        target_owner: user.id,
        target_reservation_id: reservation.reservation_id,
      });
      throw new Error("signed_upload_failed");
    }

    return json(200, {
      deduplicated: false,
      reservationId: reservation.reservation_id,
      path: signed.data.path,
      token: signed.data.token,
      bytesUsed: reservation.bytes_used,
      bytesLimit: reservation.bytes_limit,
    });
  } catch (error) {
    return handleError(error, "create_media_upload");
  }
});
