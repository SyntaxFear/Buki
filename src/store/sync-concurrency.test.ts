const mockNetInfoFetch = jest.fn();
let mockNetworkListener: ((state: unknown) => void) | null = null;
let mockQueueListener: (() => void) | null = null;

const mockLoadSummary = jest.fn();
const mockGetDeviceId = jest.fn();
const mockLoadReady = jest.fn();
const mockComplete = jest.fn();
const mockFail = jest.fn();
const mockSaveAutomatic = jest.fn();
const mockMarkCompleted = jest.fn();
const mockEnqueueDevice = jest.fn();
const mockFlushWrites = jest.fn();
const mockPushRemote = jest.fn();
const mockVerifyRemote = jest.fn();
const mockRestore = jest.fn();
const mockVerifyEntitlement = jest.fn();

let mockSummary = {
  automaticBackup: false,
  pendingCount: 0,
  nextAttemptAt: null as number | null,
  lastSyncedAt: null as string | null,
  lastError: null as string | null,
};

const mockMembershipState: Record<string, any> = {
  capabilities: { cloudBackup: true },
  hadPro: true,
};
const mockMembershipListeners = new Set<(state: any, previous: any) => void>();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockNetInfoFetch(...args),
    addEventListener: (listener: (state: unknown) => void) => {
      mockNetworkListener = listener;
      return () => {
        if (mockNetworkListener === listener) mockNetworkListener = null;
      };
    },
  },
}));

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.1",
  nativeBuildVersion: "10",
}));

jest.mock("expo-crypto", () => ({ randomUUID: () => "device-a" }));

jest.mock("@/database", () => ({
  completeBukiSyncOperations: (...args: unknown[]) => mockComplete(...args),
  enqueueBukiSyncDevice: (...args: unknown[]) => mockEnqueueDevice(...args),
  failBukiSyncOperation: (...args: unknown[]) => mockFail(...args),
  flushLibraryWrites: (...args: unknown[]) => mockFlushWrites(...args),
  getOrCreateBukiSyncDeviceId: (...args: unknown[]) => mockGetDeviceId(...args),
  loadBukiSyncSummary: (...args: unknown[]) => mockLoadSummary(...args),
  loadReadyBukiSyncOperations: (...args: unknown[]) => mockLoadReady(...args),
  markBukiSyncCompleted: (...args: unknown[]) => mockMarkCompleted(...args),
  saveBukiAutomaticBackup: (...args: unknown[]) => mockSaveAutomatic(...args),
}));

jest.mock("@/sync/remote", () => ({
  pushRemoteSyncItem: (...args: unknown[]) => mockPushRemote(...args),
  verifyRemoteCloudAccess: (...args: unknown[]) => mockVerifyRemote(...args),
}));

jest.mock("@/sync/signals", () => ({
  subscribeToSyncQueue: (listener: () => void) => {
    mockQueueListener = listener;
    return () => {
      if (mockQueueListener === listener) mockQueueListener = null;
    };
  },
}));

jest.mock("@/sync/cloud-restore", () => ({
  restoreCloudAccount: (...args: unknown[]) => mockRestore(...args),
}));

jest.mock("@/sync/media-upload", () => ({
  isCloudQuotaError: () => false,
}));

jest.mock("@/subscription/server-entitlement", () => ({
  verifyServerEntitlement: (...args: unknown[]) => mockVerifyEntitlement(...args),
}));

jest.mock("@/analytics/client", () => ({ trackAnalyticsEvent: jest.fn() }));
jest.mock("@/store/membership", () => ({
  useMembership: {
    getState: () => mockMembershipState,
    setState: (update: Record<string, unknown>) => Object.assign(mockMembershipState, update),
    subscribe: (listener: (state: any, previous: any) => void) => {
      mockMembershipListeners.add(listener);
      return () => mockMembershipListeners.delete(listener);
    },
  },
}));
jest.mock("@/store/drawings", () => ({
  useDrawings: { getState: () => ({ reloadForAccount: jest.fn().mockResolvedValue(undefined) }) },
}));
jest.mock("@/store/profiles", () => ({
  useProfiles: { getState: () => ({ reloadForAccount: jest.fn().mockResolvedValue(undefined) }) },
}));

import type { SyncQueueItem } from "@/sync/types";
import { useCloudSync } from "./sync";

const item: SyncQueueItem = {
  id: "queue-a",
  ownerId: "owner-a",
  operation: "upsert",
  entityType: "artwork",
  entityId: "art-a",
  payload: { owner_id: "owner-a", id: "art-a" },
  attempts: 0,
  availableAt: 0,
  createdAt: 1,
  updatedAt: 1,
  lastError: null,
};

const restored = {
  children: 1,
  sketchpads: 1,
  artworks: 1,
  mediaFiles: 1,
  failedMediaCount: 0,
  restoredAt: "2026-08-09T08:00:00.000Z",
};

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function initialize(isConnected = true): Promise<void> {
  mockNetInfoFetch.mockResolvedValue({
    isConnected,
    isInternetReachable: isConnected,
  });
  await useCloudSync.getState().initializeForUser("owner-a");
}

describe("cloud sync scheduler and concurrency", () => {
  beforeEach(async () => {
    await useCloudSync.getState().disconnectUser();
    jest.clearAllMocks();
    mockQueueListener = null;
    mockNetworkListener = null;
    mockMembershipState.capabilities = { cloudBackup: true };
    mockMembershipState.hadPro = true;
    mockSummary = {
      automaticBackup: false,
      pendingCount: 0,
      nextAttemptAt: null,
      lastSyncedAt: null,
      lastError: null,
    };
    mockLoadSummary.mockImplementation(async () => ({ ...mockSummary }));
    mockGetDeviceId.mockResolvedValue("device-a");
    mockComplete.mockResolvedValue(undefined);
    mockFail.mockResolvedValue(null);
    mockSaveAutomatic.mockResolvedValue(undefined);
    mockMarkCompleted.mockResolvedValue(undefined);
    mockEnqueueDevice.mockResolvedValue(undefined);
    mockFlushWrites.mockResolvedValue(undefined);
    mockVerifyRemote.mockResolvedValue({
      cloudAccess: true,
      hadPro: true,
      retention: { status: "active", readOnlySince: null, deleteAfter: null, uploadsEnabled: true },
    });
    mockVerifyEntitlement.mockResolvedValue({
      cloudAccess: true,
      hadPro: true,
      retention: { status: "active", readOnlySince: null, deleteAfter: null, uploadsEnabled: true },
    });
    mockRestore.mockResolvedValue(restored);
    mockLoadReady.mockResolvedValue([]);
    mockPushRemote.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await useCloudSync.getState().disconnectUser();
    jest.useRealTimers();
  });

  it("re-prioritizes fresh ready work ahead of an existing long retry timer", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-09T08:00:00.000Z"));
    await initialize(true);
    mockSummary = { ...mockSummary, automaticBackup: true, pendingCount: 1 };
    useCloudSync.setState({ automaticBackup: true });
    mockLoadReady.mockResolvedValue([item]);
    mockPushRemote.mockRejectedValue(new Error("temporary outage"));
    mockFail.mockImplementation(async () => {
      const retryAt = Date.now() + 60 * 60 * 1000;
      mockSummary = { ...mockSummary, nextAttemptAt: retryAt, lastError: "temporary outage" };
      return retryAt;
    });

    await useCloudSync.getState().syncNow(true);
    expect(mockVerifyRemote).toHaveBeenCalledTimes(1);

    mockSummary = { ...mockSummary, pendingCount: 2, nextAttemptAt: Date.now(), lastError: null };
    mockQueueListener?.();
    await settle();
    await jest.advanceTimersByTimeAsync(1);

    expect(mockVerifyRemote).toHaveBeenCalledTimes(2);
  });

  it("serializes a newly triggered sync behind an active manual restore", async () => {
    await initialize(true);
    mockSummary = { ...mockSummary, automaticBackup: true, pendingCount: 0 };
    useCloudSync.setState({ automaticBackup: true });
    let releaseRestore!: () => void;
    const firstRestore = new Promise<typeof restored>((resolve) => {
      releaseRestore = () => resolve(restored);
    });
    mockRestore
      .mockImplementationOnce(() => firstRestore)
      .mockResolvedValue(restored);

    const restoring = useCloudSync.getState().restoreNow();
    while (mockRestore.mock.calls.length === 0) await settle();
    const syncing = useCloudSync.getState().syncNow(true);
    await settle();
    const overlapped = mockVerifyRemote.mock.calls.length > 0;

    releaseRestore();
    await Promise.all([restoring, syncing]);
    expect(overlapped).toBe(false);
  });

  it("deduplicates simultaneous sync triggers and disconnect waits for the active run", async () => {
    await initialize(true);
    mockSummary = { ...mockSummary, automaticBackup: true, pendingCount: 1 };
    useCloudSync.setState({ automaticBackup: true });
    mockLoadReady.mockResolvedValueOnce([item]).mockResolvedValue([]);
    let releasePush!: () => void;
    mockPushRemote.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releasePush = resolve;
    }));

    const first = useCloudSync.getState().syncNow(true);
    const second = useCloudSync.getState().syncNow(true);
    while (mockPushRemote.mock.calls.length === 0) await settle();
    let disconnected = false;
    const disconnecting = useCloudSync.getState().disconnectUser().then(() => {
      disconnected = true;
    });
    await settle();
    expect(disconnected).toBe(false);
    expect(mockPushRemote).toHaveBeenCalledTimes(1);

    releasePush();
    await Promise.all([first, second, disconnecting]);
    expect(disconnected).toBe(true);
    expect(useCloudSync.getState().ownerId).toBeNull();
  });

  it("keeps queued data untouched while offline and recovers on manual Sync Now", async () => {
    await initialize(false);
    mockSummary = { ...mockSummary, automaticBackup: true, pendingCount: 1 };
    useCloudSync.setState({ automaticBackup: true });
    await useCloudSync.getState().syncNow(true);
    expect(useCloudSync.getState().status).toBe("offline");
    expect(mockPushRemote).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();

    mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockLoadReady.mockResolvedValueOnce([item]).mockResolvedValue([]);
    await useCloudSync.getState().syncNow(true);
    expect(mockPushRemote).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledWith("owner-a", ["queue-a"]);
  });
});
