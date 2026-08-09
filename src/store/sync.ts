import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { AppState, type AppStateStatus } from "react-native";
import { create } from "zustand";

import {
  completeBukiSyncOperations,
  enqueueBukiSyncDevice,
  failBukiSyncOperation,
  flushLibraryWrites,
  getOrCreateBukiSyncDeviceId,
  loadBukiSyncSummary,
  loadReadyBukiSyncOperations,
  markBukiSyncCompleted,
  saveBukiAutomaticBackup,
} from "@/database";
import { processSyncItems } from "@/sync/queue-policy";
import { pushRemoteSyncItem, verifyRemoteCloudAccess } from "@/sync/remote";
import { subscribeToSyncQueue } from "@/sync/signals";
import { restoreCloudAccount } from "@/sync/cloud-restore";
import type { CloudRestoreResult } from "@/sync/cloud-types";
import { isCloudQuotaError } from "@/sync/media-upload";
import { verifyServerEntitlement } from "@/subscription/server-entitlement";
import { trackAnalyticsEvent } from "@/analytics/client";
import { useDrawings } from "./drawings";
import { useMembership } from "./membership";
import { useProfiles } from "./profiles";

export type CloudSyncStatus = "idle" | "syncing" | "offline" | "paused" | "error";

interface CloudSyncState {
  hydrated: boolean;
  ownerId: string | null;
  deviceId: string | null;
  automaticBackup: boolean;
  status: CloudSyncStatus;
  pendingCount: number;
  nextAttemptAt: number | null;
  lastSyncedAt: string | null;
  lastRestore: CloudRestoreResult | null;
  error: string | null;
  initializeForUser: (ownerId: string) => Promise<void>;
  disconnectUser: () => Promise<void>;
  refreshSyncState: () => Promise<void>;
  setAutomaticBackup: (enabled: boolean) => Promise<void>;
  pauseForPrivacyAction: () => Promise<void>;
  syncNow: (force?: boolean) => Promise<void>;
  restoreNow: () => Promise<boolean>;
}

let networkUnsubscribe: (() => void) | null = null;
let queueUnsubscribe: (() => void) | null = null;
let membershipUnsubscribe: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimerDueAt: number | null = null;
let syncRun: Promise<void> | null = null;
let restoreRun: Promise<boolean> | null = null;
let deferredSyncDelay: number | null = null;
let online = true;

function isOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

function appVersion(): string | null {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (version && build) return `${version} (${build})`;
  return version ?? build ?? null;
}

function clearRetryTimer(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryTimerDueAt = null;
}

function scheduleSync(delay = 0): void {
  const boundedDelay = Math.max(0, Math.min(delay, 2_000_000_000));
  if (syncRun) {
    deferredSyncDelay = deferredSyncDelay === null
      ? boundedDelay
      : Math.min(deferredSyncDelay, boundedDelay);
    return;
  }
  if (!useCloudSync.getState().ownerId) return;
  const dueAt = Date.now() + boundedDelay;
  if (retryTimer && retryTimerDueAt !== null && retryTimerDueAt <= dueAt) return;
  clearRetryTimer();
  retryTimerDueAt = dueAt;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryTimerDueAt = null;
    void useCloudSync.getState().syncNow(false);
  }, boundedDelay);
}

function teardownListeners(): void {
  networkUnsubscribe?.();
  queueUnsubscribe?.();
  membershipUnsubscribe?.();
  appStateSubscription?.remove();
  networkUnsubscribe = null;
  queueUnsubscribe = null;
  membershipUnsubscribe = null;
  appStateSubscription = null;
  deferredSyncDelay = null;
  clearRetryTimer();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Buki could not finish cloud backup.";
}

async function refreshOwner(ownerId: string): Promise<void> {
  const summary = await loadBukiSyncSummary(ownerId);
  if (useCloudSync.getState().ownerId !== ownerId) return;
  useCloudSync.setState({
    automaticBackup: summary.automaticBackup,
    pendingCount: summary.pendingCount,
    nextAttemptAt: summary.nextAttemptAt,
    lastSyncedAt: summary.lastSyncedAt,
    error: summary.lastError,
  });
}

async function reloadRestoredAccount(): Promise<void> {
  await Promise.all([
    useDrawings.getState().reloadForAccount(),
    useProfiles.getState().reloadForAccount(),
  ]);
}

function installListeners(ownerId: string): void {
  networkUnsubscribe = NetInfo.addEventListener((state) => {
    online = isOnline(state);
    if (useCloudSync.getState().ownerId !== ownerId) return;
    if (!online) {
      useCloudSync.setState({ status: "offline" });
      return;
    }
    if (useCloudSync.getState().automaticBackup) scheduleSync();
  });

  queueUnsubscribe = subscribeToSyncQueue(() => {
    if (useCloudSync.getState().ownerId !== ownerId) return;
    void refreshOwner(ownerId).then(() => {
      if (useCloudSync.getState().automaticBackup) scheduleSync();
    }).catch((error) => {
      if (useCloudSync.getState().ownerId === ownerId) {
        useCloudSync.setState({ status: "error", error: message(error) });
      }
    });
  });

  membershipUnsubscribe = useMembership.subscribe((state, previous) => {
    if (useCloudSync.getState().ownerId !== ownerId) return;
    if (state.capabilities.cloudBackup && !previous.capabilities.cloudBackup) {
      scheduleSync();
    } else if (!state.capabilities.cloudBackup && previous.capabilities.cloudBackup) {
      useCloudSync.setState({ status: "paused" });
    }
  });

  appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state !== "active" || useCloudSync.getState().ownerId !== ownerId) return;
    void refreshOwner(ownerId).then(() => {
      if (useCloudSync.getState().automaticBackup) scheduleSync();
    }).catch((error) => {
      if (useCloudSync.getState().ownerId === ownerId) {
        useCloudSync.setState({ status: "error", error: message(error) });
      }
    });
  });
}

export const useCloudSync = create<CloudSyncState>((set, get) => ({
  hydrated: false,
  ownerId: null,
  deviceId: null,
  automaticBackup: true,
  status: "idle",
  pendingCount: 0,
  nextAttemptAt: null,
  lastSyncedAt: null,
  lastRestore: null,
  error: null,

  initializeForUser: async (ownerId) => {
    if (get().ownerId === ownerId && get().hydrated) return;
    teardownListeners();
    set({
      hydrated: false,
      ownerId,
      deviceId: null,
      automaticBackup: true,
      status: "idle",
      pendingCount: 0,
      nextAttemptAt: null,
      lastSyncedAt: null,
      lastRestore: null,
      error: null,
    });
    try {
      const [summary, deviceId, network] = await Promise.all([
        loadBukiSyncSummary(ownerId),
        getOrCreateBukiSyncDeviceId(Crypto.randomUUID()),
        NetInfo.fetch(),
      ]);
      if (get().ownerId !== ownerId) return;
      online = isOnline(network);
      set({
        hydrated: true,
        deviceId,
        automaticBackup: summary.automaticBackup,
        pendingCount: summary.pendingCount,
        nextAttemptAt: summary.nextAttemptAt,
        lastSyncedAt: summary.lastSyncedAt,
        lastRestore: null,
        error: summary.lastError,
        status: online ? "idle" : "offline",
      });
      installListeners(ownerId);
      if (summary.automaticBackup && online) scheduleSync();
    } catch (error) {
      if (get().ownerId === ownerId) {
        set({ hydrated: true, status: "error", error: message(error) });
      }
    }
  },

  disconnectUser: async () => {
    teardownListeners();
    set({
      hydrated: true,
      ownerId: null,
      deviceId: null,
      automaticBackup: true,
      status: "idle",
      pendingCount: 0,
      nextAttemptAt: null,
      lastSyncedAt: null,
      lastRestore: null,
      error: null,
    });
    const activeRuns = [syncRun, restoreRun].filter(
      (run): run is Promise<void> | Promise<boolean> => run !== null,
    );
    if (activeRuns.length > 0) await Promise.allSettled(activeRuns);
  },

  refreshSyncState: async () => {
    const ownerId = get().ownerId;
    if (!ownerId) return;
    try {
      await refreshOwner(ownerId);
    } catch (error) {
      if (get().ownerId === ownerId) set({ status: "error", error: message(error) });
    }
  },

  setAutomaticBackup: async (enabled) => {
    const ownerId = get().ownerId;
    if (!ownerId) return;
    try {
      if (enabled) {
        const network = await NetInfo.fetch();
        online = isOnline(network);
        if (!online) throw new Error("Connect to the internet to turn cloud backup on.");
        const verification = await verifyServerEntitlement({ resumeCloudBackup: true });
        if (!verification.cloudAccess) throw new Error("Buki Pro is required to turn cloud backup on.");
        useMembership.setState({
          hadPro: useMembership.getState().hadPro || verification.hadPro,
          retentionStatus: verification.retention.status,
          cloudReadOnlySince: verification.retention.readOnlySince,
          cloudDeleteAfter: verification.retention.deleteAfter,
          cloudUploadsEnabled: verification.retention.uploadsEnabled,
        });
      }
      await saveBukiAutomaticBackup(ownerId, enabled);
      if (get().ownerId !== ownerId) return;
      set({
        automaticBackup: enabled,
        status: enabled ? (online ? "idle" : "offline") : "idle",
        error: null,
      });
      if (enabled) {
        void trackAnalyticsEvent(ownerId, {
          name: "backup_enabled",
          source: "account_center",
          feature: "cloudBackup",
          result: "success",
        });
        scheduleSync();
      }
    } catch (error) {
      if (get().ownerId === ownerId) set({ status: "error", error: message(error) });
    }
  },

  pauseForPrivacyAction: async () => {
    const ownerId = get().ownerId;
    if (!ownerId) return;
    clearRetryTimer();
    deferredSyncDelay = null;
    await saveBukiAutomaticBackup(ownerId, false);
    if (get().ownerId === ownerId) {
      set({ automaticBackup: false, status: "idle", error: null });
    }
    const activeRuns = [syncRun, restoreRun].filter(
      (run): run is Promise<void> | Promise<boolean> => run !== null,
    );
    if (activeRuns.length > 0) await Promise.allSettled(activeRuns);
  },

  syncNow: async (force = true) => {
    if (syncRun) return syncRun;
    syncRun = (async () => {
      if (restoreRun) await restoreRun;
      const ownerId = get().ownerId;
      if (!ownerId) return;
      clearRetryTimer();
      await flushLibraryWrites();
      await refreshOwner(ownerId);
      if (get().ownerId !== ownerId) return;
      if (!force && !get().automaticBackup) return;
      if (!useMembership.getState().capabilities.cloudBackup) {
        set({ status: "paused", error: null });
        return;
      }

      const network = await NetInfo.fetch();
      online = isOnline(network);
      if (!online) {
        set({ status: "offline" });
        return;
      }

      set({ status: "syncing", error: null });
      try {
        const verification = await verifyRemoteCloudAccess();
        if (get().ownerId !== ownerId) return;
        useMembership.setState({
          hadPro: useMembership.getState().hadPro || verification.hadPro,
          retentionStatus: verification.retention.status,
          cloudReadOnlySince: verification.retention.readOnlySince,
          cloudDeleteAfter: verification.retention.deleteAfter,
          cloudUploadsEnabled: verification.retention.uploadsEnabled,
        });
        if (!verification.cloudAccess) {
          if (!verification.retention.uploadsEnabled) {
            await saveBukiAutomaticBackup(ownerId, false);
            set({
              automaticBackup: false,
              status: "paused",
              error: "Cloud copies were removed. Turn backup on when you want to create them again.",
            });
            return;
          }
          set({ status: "paused", error: "Buki Pro cloud access could not be verified." });
          return;
        }

        const deviceId = get().deviceId;
        if (deviceId) {
          await enqueueBukiSyncDevice(ownerId, {
            deviceId,
            appVersion: appVersion(),
            pushedAt: new Date().toISOString(),
          });
        }

        let processedBatches = 0;
        while (processedBatches < 10 && get().ownerId === ownerId) {
          const items = await loadReadyBukiSyncOperations(ownerId, Date.now(), 100);
          if (items.length === 0) break;
          const result = await processSyncItems(items, pushRemoteSyncItem);
          await completeBukiSyncOperations(ownerId, result.completedIds);
          if (get().ownerId !== ownerId) return;
          if (result.failedItem) {
            const retryAt = await failBukiSyncOperation(ownerId, result.failedItem.id, result.error);
            await refreshOwner(ownerId);
            const quotaExceeded = isCloudQuotaError(result.error);
            set({ status: quotaExceeded ? "paused" : "error", error: message(result.error) });
            if (quotaExceeded) {
              void trackAnalyticsEvent(ownerId, {
                name: "quota_exceeded",
                source: "automatic_backup",
                feature: "cloudBackup",
                result: "failed",
              });
            }
            if (!quotaExceeded && get().automaticBackup && retryAt) {
              scheduleSync(Math.max(0, retryAt - Date.now()));
            }
            return;
          }
          processedBatches += 1;
        }

        await refreshOwner(ownerId);
        if (get().ownerId !== ownerId) return;
        if (get().pendingCount === 0) {
          const restored = await restoreCloudAccount(ownerId, deviceId);
          if (get().ownerId !== ownerId) return;
          await reloadRestoredAccount();
          const completedAt = restored.restoredAt;
          await markBukiSyncCompleted(ownerId, completedAt);
          set({
            status: "idle",
            lastSyncedAt: completedAt,
            lastRestore: restored,
            nextAttemptAt: null,
            error: restored.failedMediaCount
              ? `${restored.failedMediaCount} cloud image${restored.failedMediaCount === 1 ? "" : "s"} could not be restored.`
              : null,
          });
        } else {
          set({ status: "idle" });
          const nextAttemptAt = get().nextAttemptAt;
          scheduleSync(nextAttemptAt ? Math.max(0, nextAttemptAt - Date.now()) : 30_000);
        }
      } catch (error) {
        if (get().ownerId === ownerId) {
          set({ status: online ? "error" : "offline", error: message(error) });
          if (get().automaticBackup) scheduleSync(30_000);
        }
      }
    })().finally(() => {
      syncRun = null;
      if (deferredSyncDelay !== null) {
        const delay = deferredSyncDelay;
        deferredSyncDelay = null;
        scheduleSync(delay);
      }
    });
    return syncRun;
  },

  restoreNow: async () => {
    if (restoreRun) return restoreRun;
    restoreRun = (async () => {
      if (syncRun) await syncRun;
      const ownerId = get().ownerId;
      if (!ownerId) return false;
      await flushLibraryWrites();
      const network = await NetInfo.fetch();
      online = isOnline(network);
      if (!online) {
        set({ status: "offline", error: "Connect to the internet to restore this device." });
        return false;
      }
      set({ status: "syncing", error: null });
      try {
        const verification = await verifyServerEntitlement();
        if (get().ownerId !== ownerId) return false;
        useMembership.setState({
          hadPro: useMembership.getState().hadPro || verification.hadPro,
          retentionStatus: verification.retention.status,
          cloudReadOnlySince: verification.retention.readOnlySince,
          cloudDeleteAfter: verification.retention.deleteAfter,
          cloudUploadsEnabled: verification.retention.uploadsEnabled,
        });
        const restoreAllowed = verification.cloudAccess
          || verification.retention.status === "read_only"
          || verification.retention.status === "pending_deletion";
        if (!restoreAllowed) {
          throw new Error("No Buki Pro cloud backup is available for this account.");
        }
        const restored = await restoreCloudAccount(ownerId, get().deviceId);
        if (get().ownerId !== ownerId) return false;
        await reloadRestoredAccount();
        await refreshOwner(ownerId);
        set({
          status: "idle",
          lastRestore: restored,
          error: restored.failedMediaCount
            ? `${restored.failedMediaCount} cloud image${restored.failedMediaCount === 1 ? "" : "s"} could not be restored.`
            : null,
        });
        return true;
      } catch (error) {
        if (get().ownerId === ownerId) set({ status: "error", error: message(error) });
        return false;
      }
    })().finally(() => {
      restoreRun = null;
    });
    return restoreRun;
  },
}));
