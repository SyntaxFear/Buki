import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticatedClients, handleError, json } from "../_shared/buki.ts";
import {
  purgeOwnerCloudContent,
  queueOwnerStorageSweep,
  removeOwnerStorageObjects,
} from "../_shared/cloud-data.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  try {
    const { user, admin } = await authenticatedClients(request);
    const held = await admin
      .from("cloud_retention")
      .update({
        uploads_enabled: false,
        status: "inactive",
        read_only_since: null,
        delete_after: null,
      })
      .eq("owner_id", user.id);
    if (held.error) throw new Error("cloud_privacy_hold_failed");

    await queueOwnerStorageSweep(admin, user.id, "cloud_copy_removal");
    const removedObjects = await removeOwnerStorageObjects(admin, user.id);
    await purgeOwnerCloudContent(admin, user.id);
    return json(200, { deleted: true, removedObjects });
  } catch (error) {
    return handleError(error, "delete_cloud_data");
  }
});
