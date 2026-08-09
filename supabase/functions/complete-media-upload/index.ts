import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  assertExpectedOwner,
  authenticatedClients,
  handleError,
  HttpError,
  json,
  requestObject,
} from "../_shared/buki.ts";

type ReservationRow = {
  id: string;
  owner_id: string;
  checksum: string;
  requested_bytes: number;
  storage_path: string;
  mime_type: string;
  status: string;
  expires_at: string;
  final_storage_path?: string | null;
};

type CompletionRow = {
  deduplicated: boolean;
  storage_path: string;
  stored_bytes: number;
  stored_mime_type: string;
  bytes_used: number;
  bytes_limit: number;
};

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const { user, admin } = await authenticatedClients(request);
    const body = await requestObject(request);
    assertExpectedOwner(body, user.id);
    const reservationId = body.reservationId;
    if (typeof reservationId !== "string" || !reservationId) {
      throw new HttpError(400, "invalid_reservationId");
    }

    const reservationResult = await admin
      .from("media_upload_reservations")
      .select("*")
      .eq("id", reservationId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (reservationResult.error) throw new Error("reservation_lookup_failed");
    const reservation = reservationResult.data as ReservationRow | null;
    if (!reservation || reservation.status !== "reserved") {
      throw new HttpError(409, "upload_reservation_inactive");
    }
    if (Date.parse(reservation.expires_at) <= Date.now()) {
      throw new HttpError(409, "upload_reservation_expired");
    }
    const finalStoragePath = reservation.final_storage_path ?? reservation.storage_path;
    if (
      !reservation.storage_path.startsWith(`${user.id}/`)
      || !finalStoragePath.startsWith(`${user.id}/`)
    ) {
      throw new HttpError(409, "upload_reservation_path_invalid");
    }

    const bucket = admin.storage.from("buki-media");
    const info = await bucket.info(reservation.storage_path);
    if (info.error || !info.data) throw new HttpError(409, "uploaded_object_missing");
    if (info.data.size !== reservation.requested_bytes) {
      await bucket.remove([reservation.storage_path]);
      await admin.rpc("release_media_upload_reservation", {
        target_owner: user.id,
        target_reservation_id: reservation.id,
      });
      throw new HttpError(422, "uploaded_size_mismatch");
    }

    const downloaded = await bucket.download(reservation.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("uploaded_object_unreadable");
    const bytes = await downloaded.data.arrayBuffer();
    const checksum = hex(await crypto.subtle.digest("SHA-256", bytes));
    if (checksum !== reservation.checksum) {
      await bucket.remove([reservation.storage_path]);
      await admin.rpc("release_media_upload_reservation", {
        target_owner: user.id,
        target_reservation_id: reservation.id,
      });
      throw new HttpError(422, "uploaded_checksum_mismatch");
    }

    if (reservation.storage_path !== finalStoragePath) {
      const moved = await bucket.move(
        reservation.storage_path,
        finalStoragePath,
      );
      if (moved.error) throw new Error("uploaded_object_finalize_failed");
    }

    const completed = await admin.rpc("complete_media_upload", {
      target_owner: user.id,
      target_reservation_id: reservation.id,
      actual_bytes: reservation.requested_bytes,
    });
    if (completed.error) {
      await bucket.remove([finalStoragePath]);
      await admin.rpc("release_media_upload_reservation", {
        target_owner: user.id,
        target_reservation_id: reservation.id,
      });
      console.error("complete_media_upload failed", { code: completed.error.code });
      throw new Error("upload_commit_failed");
    }
    const result = (completed.data as CompletionRow[] | null)?.[0];
    if (!result) throw new Error("upload_commit_missing");
    if (result.deduplicated && result.storage_path !== finalStoragePath) {
      await bucket.remove([finalStoragePath]);
    }

    return json(200, {
      deduplicated: result.deduplicated,
      path: result.storage_path,
      checksum: reservation.checksum,
      byteSize: result.stored_bytes,
      mimeType: result.stored_mime_type,
      bytesUsed: result.bytes_used,
      bytesLimit: result.bytes_limit,
    });
  } catch (error) {
    return handleError(error, "complete_media_upload");
  }
});
