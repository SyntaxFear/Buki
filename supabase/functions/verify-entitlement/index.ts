import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticatedClients,
  handleError,
  json,
  requestObject,
} from "../_shared/buki.ts";
import {
  persistRevenueCatVerification,
  PRO_ENTITLEMENT_LOOKUP_KEY,
  verifyRevenueCatPro,
} from "../_shared/revenuecat.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const { user, admin } = await authenticatedClients(request);
    const body = await requestObject(request);
    if (
      body.resumeCloudBackup !== undefined && body.resumeCloudBackup !== true
    ) {
      return json(400, { error: "invalid_resumeCloudBackup" });
    }
    const verification = await verifyRevenueCatPro(user.id);
    await persistRevenueCatVerification(admin, user.id, verification);
    if (body.resumeCloudBackup === true) {
      if (!verification.active) {
        return json(403, { error: "pro_required" });
      }
      const resumed = await admin
        .from("cloud_retention")
        .update({
          uploads_enabled: true,
          status: "active",
          read_only_since: null,
          delete_after: null,
          last_cleanup_attempt_at: null,
        })
        .eq("owner_id", user.id)
        .select("owner_id")
        .single();
      if (resumed.error) throw new Error("cloud_backup_resume_failed");
    }
    const [retentionResult, snapshotResult] = await Promise.all([
      admin
        .from("cloud_retention")
        .select("status,read_only_since,delete_after,uploads_enabled")
        .eq("owner_id", user.id)
        .single(),
      admin
        .from("entitlement_snapshots")
        .select("had_pro")
        .eq("owner_id", user.id)
        .single(),
    ]);
    if (retentionResult.error) throw new Error("retention_lookup_failed");
    if (snapshotResult.error) {
      throw new Error("entitlement_snapshot_lookup_failed");
    }
    const retention = retentionResult.data as {
      status: string;
      read_only_since: string | null;
      delete_after: string | null;
      uploads_enabled: boolean;
    };
    const snapshot = snapshotResult.data as { had_pro: boolean };

    return json(200, {
      active: verification.active,
      hadPro: snapshot.had_pro,
      cloudAccess: verification.active && retention.status === "active" &&
        retention.uploads_enabled,
      entitlement: PRO_ENTITLEMENT_LOOKUP_KEY,
      expiresAt: verification.expiresAt,
      checkedAt: verification.checkedAt,
      retention: {
        status: retention.status,
        readOnlySince: retention.read_only_since,
        deleteAfter: retention.delete_after,
        uploadsEnabled: retention.uploads_enabled,
      },
    });
  } catch (error) {
    return handleError(error, "entitlement_verification");
  }
});
