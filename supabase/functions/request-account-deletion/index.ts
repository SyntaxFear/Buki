import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  assertRecentAuthentication,
  authenticatedClients,
  handleError,
  json,
} from "../_shared/buki.ts";
import {
  queueOwnerStorageSweep,
  removeOwnerStorageObjects,
} from "../_shared/cloud-data.ts";
import { deleteRevenueCatCustomer } from "../_shared/revenuecat.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  try {
    const { user, admin } = await authenticatedClients(request);
    assertRecentAuthentication(user);
    const requestedAt = new Date().toISOString();
    const requestResult = await admin.from("account_deletion_requests").upsert({
      owner_id: user.id,
      requested_at: requestedAt,
      execute_after: requestedAt,
      status: "processing",
      last_error: null,
    });
    if (requestResult.error) throw new Error("account_deletion_request_failed");
    try {
      const held = await admin
        .from("cloud_retention")
        .update({
          uploads_enabled: false,
          status: "inactive",
          read_only_since: null,
          delete_after: null,
        })
        .eq("owner_id", user.id);
      if (held.error) throw new Error("account_deletion_privacy_hold_failed");
      await deleteRevenueCatCustomer(user.id);
      await queueOwnerStorageSweep(admin, user.id, "account_deletion");
      const removedObjects = await removeOwnerStorageObjects(admin, user.id);
      const deleted = await admin.auth.admin.deleteUser(user.id, false);
      if (deleted.error) throw new Error("auth_user_delete_failed");
      return json(200, { deleted: true, removedObjects });
    } catch (error) {
      await admin.from("account_deletion_requests").update({
        status: "failed",
        last_error: error instanceof Error
          ? error.message.slice(0, 500)
          : "unknown_error",
      }).eq("owner_id", user.id);
      throw error;
    }
  } catch (error) {
    return handleError(error, "request_account_deletion");
  }
});
