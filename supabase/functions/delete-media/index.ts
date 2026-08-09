import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  assertExpectedOwner,
  authenticatedClients,
  handleError,
  HttpError,
  json,
  requestObject,
} from "../_shared/buki.ts";

type PreparedDelete = {
  delete_object: boolean;
  storage_path: string | null;
  stored_bytes: number;
};

type CompletedDelete = {
  bytes_used: number;
  bytes_limit: number;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const { user, admin } = await authenticatedClients(request);
    const body = await requestObject(request);
    assertExpectedOwner(body, user.id);
    const mediaId = body.mediaId;
    const deletedAt = body.deletedAt;
    if (typeof mediaId !== "string" || !mediaId || mediaId.length > 240) {
      throw new HttpError(400, "invalid_mediaId");
    }
    if (deletedAt !== undefined && (typeof deletedAt !== "string" || Number.isNaN(Date.parse(deletedAt)))) {
      throw new HttpError(400, "invalid_deletedAt");
    }

    const preparedResult = await admin.rpc("prepare_media_delete", {
      target_owner: user.id,
      target_media_id: mediaId,
      target_deleted_at: deletedAt ?? new Date().toISOString(),
    });
    if (preparedResult.error) {
      console.error("prepare_media_delete failed", { code: preparedResult.error.code });
      throw new Error("media_delete_prepare_failed");
    }
    const prepared = (preparedResult.data as PreparedDelete[] | null)?.[0];
    if (!prepared) throw new Error("media_delete_prepare_missing");

    if (prepared.delete_object && prepared.storage_path) {
      const removed = await admin.storage.from("buki-media").remove([prepared.storage_path]);
      if (removed.error) throw new Error("media_object_delete_failed");
    }

    const completedResult = await admin.rpc("complete_media_delete", {
      target_owner: user.id,
      target_media_id: mediaId,
    });
    if (completedResult.error) {
      console.error("complete_media_delete failed", { code: completedResult.error.code });
      throw new Error("media_delete_commit_failed");
    }
    const completed = (completedResult.data as CompletedDelete[] | null)?.[0];
    return json(200, {
      deleted: true,
      bytesUsed: completed?.bytes_used ?? 0,
      bytesLimit: completed?.bytes_limit ?? 2147483648,
    });
  } catch (error) {
    return handleError(error, "delete_media");
  }
});
