import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticatedClients,
  handleError,
  HttpError,
  json,
  requestObject,
} from "../_shared/buki.ts";
import {
  persistRevenueCatVerification,
  PRO_ENTITLEMENT_LOOKUP_KEY,
  type RevenueCatVerification,
  verifyRevenueCatPro,
} from "../_shared/revenuecat.ts";

const ENTITLEMENT_CACHE_MS = 30_000;

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
    let verification: RevenueCatVerification | null = null;
    if (body.resumeCloudBackup !== true) {
      const cached = await admin
        .from("entitlement_snapshots")
        .select("access_tier,status,expires_at,checked_at,had_pro")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (cached.error) throw new Error("entitlement_cache_lookup_failed");
      const checkedAt = cached.data?.checked_at;
      const checkedAtMs = typeof checkedAt === "string" ? Date.parse(checkedAt) : Number.NaN;
      const expiresAt = typeof cached.data?.expires_at === "string"
        ? cached.data.expires_at
        : null;
      if (
        typeof checkedAt === "string"
        && Date.now() - checkedAtMs >= 0
        && Date.now() - checkedAtMs <= ENTITLEMENT_CACHE_MS
      ) {
        verification = {
          active: cached.data.access_tier === "pro"
            && cached.data.status === "active"
            && (!expiresAt || Date.parse(expiresAt) > Date.now()),
          hadPro: cached.data.had_pro === true,
          expiresAt,
          checkedAt,
        };
      }
    }
    if (!verification) {
      const admitted = await admin.rpc("consume_entitlement_verification_rate_limit", {
        target_owner: user.id,
      });
      if (admitted.error) throw new Error("entitlement_rate_limit_check_failed");
      if (admitted.data !== true) {
        throw new HttpError(429, "entitlement_rate_limited");
      }
      verification = await verifyRevenueCatPro(user.id);
      await persistRevenueCatVerification(admin, user.id, verification);
    }
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
