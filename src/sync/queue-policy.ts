import type { SyncEntityType, SyncOperation, SyncQueueItem } from "./types";

const RETRY_DELAYS_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;

const UPSERT_PRIORITY: Record<SyncEntityType, number> = {
  adult_profile: 10,
  child_profile: 20,
  sketchpad: 30,
  artwork: 40,
  tag: 50,
  artwork_tag: 60,
  media_file: 70,
  sync_device: 80,
};

const DELETE_PRIORITY: Record<SyncEntityType, number> = {
  artwork_tag: 10,
  media_file: 20,
  artwork: 30,
  sketchpad: 40,
  child_profile: 50,
  tag: 60,
  sync_device: 70,
  adult_profile: 80,
};

export function syncPriority(operation: SyncOperation, entityType: SyncEntityType): number {
  return operation === "delete" ? DELETE_PRIORITY[entityType] : 100 + UPSERT_PRIORITY[entityType];
}

export function sortSyncItems(items: SyncQueueItem[]): SyncQueueItem[] {
  return [...items].sort((left, right) => {
    const priority = syncPriority(left.operation, left.entityType) - syncPriority(right.operation, right.entityType);
    if (priority !== 0) return priority;
    return left.createdAt - right.createdAt;
  });
}

export function retryDelayMs(attempts: number): number {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, attempts - 1));
  return RETRY_DELAYS_MS[index];
}

export function sanitizeSyncError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Cloud synchronization failed.";
  return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]").slice(0, 500);
}

export async function processSyncItems(
  items: SyncQueueItem[],
  push: (
    item: SyncQueueItem,
  ) => Promise<void | { restartBatch?: boolean }>,
): Promise<{ completedIds: string[]; failedItem: SyncQueueItem | null; error: unknown }> {
  const completedIds: string[] = [];
  for (const item of sortSyncItems(items)) {
    try {
      const result = await push(item);
      completedIds.push(item.id);
      if (result?.restartBatch) break;
    } catch (error) {
      return { completedIds, failedItem: item, error };
    }
  }
  return { completedIds, failedItem: null, error: null };
}
