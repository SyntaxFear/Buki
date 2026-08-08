export type SyncOperation = "upsert" | "delete";

export type SyncEntityType =
  | "adult_profile"
  | "child_profile"
  | "sketchpad"
  | "artwork"
  | "tag"
  | "artwork_tag"
  | "media_file"
  | "sync_device";

export interface SyncQueueItem {
  id: string;
  ownerId: string;
  operation: SyncOperation;
  entityType: SyncEntityType;
  entityId: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  availableAt: number;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

export interface SyncBatchResult {
  completedIds: string[];
  failedItem: SyncQueueItem | null;
  error: unknown;
}
