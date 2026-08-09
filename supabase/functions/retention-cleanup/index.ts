import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  handleError,
  HttpError,
  json,
  requiredSecret,
} from "../_shared/buki.ts";
import {
  purgeOwnerCloudContent,
  queueOwnerStorageSweep,
  removeOwnerStorageObjects,
} from "../_shared/cloud-data.ts";
import {
  persistRevenueCatVerification,
  verifyRevenueCatPro,
} from "../_shared/revenuecat.ts";
import { removableStaleUploadPaths } from "../_shared/stale-upload.ts";

type DueRetention = { claimed_owner_id: string };
type DueEntitlementRefresh = { claimed_owner_id: string };
type DueStorageSweep = {
  claimed_owner_id: string;
  claimed_final_sweep_after: string;
};
type StaleUploadReservation = {
  claimed_reservation_id: string;
  claimed_owner_id: string;
  claimed_storage_path: string;
  claimed_final_storage_path: string;
};

async function processEntitlementRefreshes(admin: SupabaseClient): Promise<{
  claimed: number;
  active: number;
  expired: number;
  failed: number;
}> {
  const claimed = await admin.rpc("claim_entitlements_due_for_refresh", {
    batch_limit: 25,
  });
  if (claimed.error) throw new Error("entitlement_refresh_claim_failed");
  const owners = (claimed.data ?? []) as DueEntitlementRefresh[];
  let active = 0;
  let expired = 0;
  let failed = 0;

  for (const item of owners) {
    try {
      const verification = await verifyRevenueCatPro(item.claimed_owner_id);
      await persistRevenueCatVerification(
        admin,
        item.claimed_owner_id,
        verification,
      );
      if (verification.active) active += 1;
      else expired += 1;
    } catch (error) {
      failed += 1;
      console.error("entitlement refresh failed", {
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return { claimed: owners.length, active, expired, failed };
}

async function processStorageSweeps(admin: SupabaseClient): Promise<{
  claimed: number;
  removedObjects: number;
  completed: number;
  failed: number;
}> {
  const claimed = await admin.rpc("claim_storage_deletion_sweeps", {
    batch_limit: 25,
  });
  if (claimed.error) throw new Error("storage_sweep_claim_failed");
  const sweeps = (claimed.data ?? []) as DueStorageSweep[];
  let removedObjects = 0;
  let completed = 0;
  let failed = 0;

  for (const sweep of sweeps) {
    try {
      const finalSweepAt = Date.parse(sweep.claimed_final_sweep_after);
      if (!Number.isFinite(finalSweepAt)) {
        throw new Error("storage_sweep_deadline_invalid");
      }
      const removed = await removeOwnerStorageObjects(
        admin,
        sweep.claimed_owner_id,
      );
      removedObjects += removed;
      if (Date.now() >= finalSweepAt && removed === 0) {
        const deleted = await admin
          .from("storage_deletion_sweeps")
          .delete()
          .eq("owner_id", sweep.claimed_owner_id);
        if (deleted.error) throw new Error("storage_sweep_complete_failed");
        completed += 1;
      } else {
        const updated = await admin
          .from("storage_deletion_sweeps")
          .update({ last_error: null, updated_at: new Date().toISOString() })
          .eq("owner_id", sweep.claimed_owner_id);
        if (updated.error) throw new Error("storage_sweep_update_failed");
      }
    } catch (error) {
      failed += 1;
      await admin
        .from("storage_deletion_sweeps")
        .update({
          last_error: error instanceof Error
            ? error.message.slice(0, 500)
            : "unknown_error",
          next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", sweep.claimed_owner_id);
    }
  }

  return { claimed: sweeps.length, removedObjects, completed, failed };
}

async function processStaleUploadReservations(admin: SupabaseClient): Promise<{
  claimed: number;
  released: number;
  removedPaths: number;
  failed: number;
}> {
  const claimed = await admin.rpc("claim_stale_media_upload_reservations", {
    batch_limit: 50,
  });
  if (claimed.error) throw new Error("stale_upload_claim_failed");
  const reservations = (claimed.data ?? []) as StaleUploadReservation[];
  let released = 0;
  let removedPaths = 0;
  let failed = 0;

  for (const reservation of reservations) {
    try {
      const paths = [
        ...new Set([
          reservation.claimed_storage_path,
          reservation.claimed_final_storage_path,
        ]),
      ];

      const referencedResult = await admin
        .from("media_files")
        .select("storage_path")
        .eq("owner_id", reservation.claimed_owner_id)
        .eq("upload_state", "uploaded")
        .is("deleted_at", null)
        .in("storage_path", paths);
      if (referencedResult.error) {
        throw new Error("stale_upload_reference_lookup_failed");
      }
      const referencedPaths = new Set(
        ((referencedResult.data ?? []) as { storage_path: string }[])
          .map((row) => row.storage_path),
      );
      const removablePaths = removableStaleUploadPaths({
        ownerId: reservation.claimed_owner_id,
        uploadPath: reservation.claimed_storage_path,
        finalPath: reservation.claimed_final_storage_path,
        referencedPaths,
      });
      if (removablePaths.length > 0) {
        const removed = await admin.storage.from("buki-media").remove(
          removablePaths,
        );
        if (removed.error) throw new Error("stale_upload_object_delete_failed");
        removedPaths += removablePaths.length;
      }

      const finalized = await admin.rpc(
        "finalize_stale_media_upload_reservation",
        {
          target_owner: reservation.claimed_owner_id,
          target_reservation_id: reservation.claimed_reservation_id,
          cleanup_error: null,
        },
      );
      if (finalized.error) throw new Error("stale_upload_finalize_failed");
      released += 1;
    } catch (error) {
      failed += 1;
      const failure = error instanceof Error ? error.message : "unknown_error";
      const recorded = await admin.rpc(
        "finalize_stale_media_upload_reservation",
        {
          target_owner: reservation.claimed_owner_id,
          target_reservation_id: reservation.claimed_reservation_id,
          cleanup_error: failure,
        },
      );
      if (recorded.error) {
        console.error("stale upload cleanup failure could not be recorded", {
          code: recorded.error.code,
        });
      }
    }
  }

  return { claimed: reservations.length, released, removedPaths, failed };
}

async function validCronSecret(
  request: Request,
  admin: SupabaseClient,
): Promise<boolean> {
  const provided = request.headers.get("x-buki-cron-secret");
  if (!provided) return false;
  const verified = await admin.rpc("verify_retention_cron_secret", {
    provided_secret: provided,
  });
  return !verified.error && verified.data === true;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  try {
    const admin = createClient(
      requiredSecret("SUPABASE_URL"),
      requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    if (!(await validCronSecret(request, admin))) {
      throw new HttpError(401, "invalid_cron_secret");
    }
    const entitlementRefresh = await processEntitlementRefreshes(admin);
    const storageSweeps = await processStorageSweeps(admin);
    const staleUploads = await processStaleUploadReservations(admin);
    const analyticsCutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)).toISOString();
    const analyticsCleanup = await admin
      .from("analytics_events")
      .delete({ count: "exact" })
      .lt("received_at", analyticsCutoff);
    if (analyticsCleanup.error) throw new Error("analytics_retention_cleanup_failed");
    const analyticsRateLimitCleanup = await admin
      .from("analytics_rate_limits")
      .delete({ count: "exact" })
      .lt("updated_at", new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString());
    if (analyticsRateLimitCleanup.error) throw new Error("analytics_rate_limit_cleanup_failed");
    const claimed = await admin.rpc("claim_due_cloud_retention", {
      batch_limit: 25,
    });
    if (claimed.error) throw new Error("retention_claim_failed");
    const owners = (claimed.data ?? []) as DueRetention[];
    let deleted = 0;
    let renewed = 0;
    let failed = 0;

    for (const item of owners) {
      try {
        const verification = await verifyRevenueCatPro(item.claimed_owner_id);
        await persistRevenueCatVerification(
          admin,
          item.claimed_owner_id,
          verification,
        );
        if (verification.active) {
          renewed += 1;
          continue;
        }
        const retentionResult = await admin
          .from("cloud_retention")
          .select("status,delete_after")
          .eq("owner_id", item.claimed_owner_id)
          .single();
        if (retentionResult.error) throw new Error("retention_recheck_failed");
        const retention = retentionResult.data as {
          status: string;
          delete_after: string | null;
        };
        if (
          retention.status !== "pending_deletion" ||
          !retention.delete_after ||
          Date.parse(retention.delete_after) > Date.now()
        ) {
          continue;
        }
        await queueOwnerStorageSweep(
          admin,
          item.claimed_owner_id,
          "retention_expiry",
        );
        await removeOwnerStorageObjects(admin, item.claimed_owner_id);
        await purgeOwnerCloudContent(admin, item.claimed_owner_id);
        deleted += 1;
      } catch (error) {
        failed += 1;
        console.error("retention owner cleanup failed", {
          message: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    return json(200, {
      entitlementRefresh,
      staleUploads,
      retention: { claimed: owners.length, deleted, renewed, failed },
      storageSweeps,
      analyticsDeleted: analyticsCleanup.count ?? 0,
      analyticsRateLimitsDeleted: analyticsRateLimitCleanup.count ?? 0,
    });
  } catch (error) {
    return handleError(error, "retention_cleanup");
  }
});
