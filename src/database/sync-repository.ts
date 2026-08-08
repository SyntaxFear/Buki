import type { SQLiteDatabase } from "expo-sqlite";

import { retryDelayMs, sanitizeSyncError } from "@/sync/queue-policy";
import type { SyncEntityType, SyncOperation, SyncQueueItem } from "@/sync/types";

const TOMBSTONED_TYPES = new Set<SyncEntityType>([
  "child_profile",
  "sketchpad",
  "artwork",
  "tag",
  "media_file",
]);

const SYNC_ENTITY_TYPES = new Set<SyncEntityType>([
  "adult_profile",
  "child_profile",
  "sketchpad",
  "artwork",
  "tag",
  "artwork_tag",
  "media_file",
  "sync_device",
]);

interface SyncQueueRow {
  id: string;
  owner_id: string;
  operation: string;
  entity_type: string;
  entity_id: string;
  payload: string | null;
  attempts: number;
  available_at: number;
  created_at: number;
  updated_at: number;
  last_error: string | null;
}

export interface LocalSyncSummary {
  automaticBackup: boolean;
  pendingCount: number;
  nextAttemptAt: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

function preferenceKey(name: string, ownerId: string): string {
  return `${name}:${ownerId}`;
}

function payloadFromJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function queueItem(row: SyncQueueRow): SyncQueueItem {
  if (!SYNC_ENTITY_TYPES.has(row.entity_type as SyncEntityType)) {
    throw new Error(`Unsupported queued entity type: ${row.entity_type}`);
  }
  if (row.operation !== "upsert" && row.operation !== "delete") {
    throw new Error(`Unsupported queued operation: ${row.operation}`);
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    operation: row.operation,
    entityType: row.entity_type as SyncEntityType,
    entityId: row.entity_id,
    payload: payloadFromJson(row.payload),
    attempts: row.attempts,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
  };
}

export async function enqueueLocalSyncOperation(
  db: SQLiteDatabase,
  input: {
    ownerId: string;
    operation: SyncOperation;
    entityType: SyncEntityType;
    entityId: string;
    payload?: Record<string, unknown> | null;
    now?: number;
  },
): Promise<void> {
  const now = input.now ?? Date.now();
  const queueId = `sync:${input.ownerId}:${input.entityType}:${input.entityId}`;
  await db.runAsync(
    `INSERT INTO sync_queue (
      id, owner_id, operation, entity_type, entity_id, payload,
      attempts, available_at, created_at, updated_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL)
    ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET
      operation = excluded.operation,
      payload = excluded.payload,
      attempts = 0,
      available_at = excluded.available_at,
      updated_at = excluded.updated_at,
      last_error = NULL`,
    queueId,
    input.ownerId,
    input.operation,
    input.entityType,
    input.entityId,
    input.payload ? JSON.stringify(input.payload) : null,
    now,
    now,
    now,
  );

  if (!TOMBSTONED_TYPES.has(input.entityType)) return;
  if (input.operation === "upsert") {
    await db.runAsync(
      "DELETE FROM tombstones WHERE owner_id = ? AND entity_type = ? AND entity_id = ?",
      input.ownerId,
      input.entityType,
      input.entityId,
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO tombstones (id, owner_id, entity_type, entity_id, deleted_at, synced_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET
       deleted_at = MAX(tombstones.deleted_at, excluded.deleted_at),
       synced_at = NULL`,
    `tombstone:${input.ownerId}:${input.entityType}:${input.entityId}`,
    input.ownerId,
    input.entityType,
    input.entityId,
    now,
  );
}

export async function loadReadyLocalSyncOperations(
  db: SQLiteDatabase,
  ownerId: string,
  now = Date.now(),
  limit = 100,
): Promise<SyncQueueItem[]> {
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT id, owner_id, operation, entity_type, entity_id, payload, attempts,
            available_at, created_at, updated_at, last_error
     FROM sync_queue
     WHERE owner_id = ? AND available_at <= ?
     ORDER BY
       CASE
         WHEN operation = 'upsert' AND entity_type = 'adult_profile' THEN 10
         WHEN operation = 'upsert' AND entity_type = 'child_profile' THEN 20
         WHEN operation = 'upsert' AND entity_type = 'sketchpad' THEN 30
         WHEN operation = 'upsert' AND entity_type = 'artwork' THEN 40
         WHEN operation = 'upsert' AND entity_type = 'tag' THEN 50
         WHEN operation = 'upsert' AND entity_type = 'artwork_tag' THEN 60
         WHEN operation = 'upsert' AND entity_type = 'media_file' THEN 70
         WHEN operation = 'upsert' AND entity_type = 'sync_device' THEN 80
         WHEN operation = 'delete' AND entity_type = 'artwork_tag' THEN 110
         WHEN operation = 'delete' AND entity_type = 'media_file' THEN 120
         WHEN operation = 'delete' AND entity_type = 'artwork' THEN 130
         WHEN operation = 'delete' AND entity_type = 'sketchpad' THEN 140
         WHEN operation = 'delete' AND entity_type = 'child_profile' THEN 150
         WHEN operation = 'delete' AND entity_type = 'tag' THEN 160
         ELSE 999
       END,
       created_at,
       rowid
     LIMIT ?`,
    ownerId,
    now,
    limit,
  );
  return rows.map(queueItem);
}

export async function completeLocalSyncOperations(
  db: SQLiteDatabase,
  ownerId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM sync_queue WHERE owner_id = ? AND id IN (${placeholders})`,
    ownerId,
    ...ids,
  );
}

export async function failLocalSyncOperation(
  db: SQLiteDatabase,
  ownerId: string,
  id: string,
  error: unknown,
  now = Date.now(),
): Promise<number | null> {
  const current = await db.getFirstAsync<{ attempts: number }>(
    "SELECT attempts FROM sync_queue WHERE id = ? AND owner_id = ?",
    id,
    ownerId,
  );
  if (!current) return null;
  const attempts = current.attempts + 1;
  const availableAt = now + retryDelayMs(attempts);
  await db.runAsync(
    `UPDATE sync_queue
     SET attempts = ?, available_at = ?, updated_at = ?, last_error = ?
     WHERE id = ? AND owner_id = ?`,
    attempts,
    availableAt,
    now,
    sanitizeSyncError(error),
    id,
    ownerId,
  );
  return availableAt;
}

export async function loadLocalSyncSummary(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<LocalSyncSummary> {
  const queue = await db.getFirstAsync<{
    pending_count: number;
    next_attempt_at: number | null;
    last_error: string | null;
  }>(
    `SELECT COUNT(*) AS pending_count,
            MIN(available_at) AS next_attempt_at,
            (SELECT last_error FROM sync_queue errors
             WHERE errors.owner_id = ? AND errors.last_error IS NOT NULL
             ORDER BY errors.updated_at DESC LIMIT 1) AS last_error
     FROM sync_queue WHERE owner_id = ?`,
    ownerId,
    ownerId,
  );
  const preferences = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM preferences WHERE key IN (?, ?)",
    preferenceKey("automatic_backup", ownerId),
    preferenceKey("last_sync_at", ownerId),
  );
  const values = new Map(preferences.map((entry) => [entry.key, entry.value]));
  return {
    automaticBackup: values.get(preferenceKey("automatic_backup", ownerId)) !== "false",
    pendingCount: queue?.pending_count ?? 0,
    nextAttemptAt: queue?.next_attempt_at ?? null,
    lastSyncedAt: values.get(preferenceKey("last_sync_at", ownerId)) ?? null,
    lastError: queue?.last_error ?? null,
  };
}

export async function setLocalAutomaticBackup(
  db: SQLiteDatabase,
  ownerId: string,
  enabled: boolean,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    preferenceKey("automatic_backup", ownerId),
    enabled ? "true" : "false",
    Date.now(),
  );
}

export async function markLocalSyncCompleted(
  db: SQLiteDatabase,
  ownerId: string,
  completedAt: string,
): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      preferenceKey("last_sync_at", ownerId),
      completedAt,
      now,
    );
    await tx.runAsync(
      "UPDATE tombstones SET synced_at = ? WHERE owner_id = ? AND synced_at IS NULL",
      now,
      ownerId,
    );
  });
}

export async function getOrCreateLocalSyncDeviceId(
  db: SQLiteDatabase,
  generatedId: string,
): Promise<string> {
  const key = "sync_device_id";
  const existing = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    key,
  );
  if (existing?.value) return existing.value;
  await db.runAsync(
    "INSERT OR IGNORE INTO preferences (key, value, updated_at) VALUES (?, ?, ?)",
    key,
    generatedId,
    Date.now(),
  );
  const stored = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    key,
  );
  return stored?.value ?? generatedId;
}
