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
import { useMembership } from "./membership";

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
  error: string | null;
  initializeForUser: (ownerId: string) => Promise<void>;
  disconnectUser: () => void;
  refreshSyncState: () => Promise<void>;
  setAutomaticBackup: (enabled: boolean) => Promise<void>;
  syncNow: (force?: boolean) => Promise<void>;
}

let networkUnsubscribe: (() => void) | null = null;
let queueUnsubscribe: (() => void) | null = null;
let membershipUnsubscribe: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let syncRun: Promise<void> | null = null;
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
}

function scheduleSync(delay = 0): void {
  if (syncRun) {
    deferredSyncDelay = deferredSyncDelay === null ? delay : Math.min(deferredSyncDelay, delay);
    return;
  }
  if (retryTimer || !useCloudSync.getState().ownerId) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void useCloudSync.getState().syncNow(false);
  }, Math.max(0, Math.min(delay, 2_000_000_000)));
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

  disconnectUser: () => {
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
      error: null,
    });
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
      await saveBukiAutomaticBackup(ownerId, enabled);
      if (get().ownerId !== ownerId) return;
      set({
        automaticBackup: enabled,
        status: enabled ? (online ? "idle" : "offline") : "idle",
        error: null,
      });
      if (enabled) scheduleSync();
    } catch (error) {
      if (get().ownerId === ownerId) set({ status: "error", error: message(error) });
    }
  },

  syncNow: async (force = true) => {
    if (syncRun) return syncRun;
    syncRun = (async () => {
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
        const active = await verifyRemoteCloudAccess();
        if (get().ownerId !== ownerId) return;
        if (!active) {
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
            set({ status: "error", error: message(result.error) });
            if (get().automaticBackup && retryAt) {
              scheduleSync(Math.max(0, retryAt - Date.now()));
            }
            return;
          }
          processedBatches += 1;
        }

        await refreshOwner(ownerId);
        if (get().ownerId !== ownerId) return;
        if (get().pendingCount === 0) {
          const completedAt = new Date().toISOString();
          await markBukiSyncCompleted(ownerId, completedAt);
          set({ status: "idle", lastSyncedAt: completedAt, nextAttemptAt: null, error: null });
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
}));
