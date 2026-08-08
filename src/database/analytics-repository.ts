import type { SQLiteDatabase } from "expo-sqlite";

export interface QueuedAnalyticsEvent {
  id: string;
  ownerId: string;
  eventName: string;
  source: string | null;
  feature: string | null;
  plan: string | null;
  result: string | null;
  exportKind: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  occurredAt: number;
  attempts: number;
}

type AnalyticsQueueRow = {
  id: string;
  owner_id: string;
  event_name: string;
  source: string | null;
  feature: string | null;
  plan: string | null;
  result: string | null;
  export_kind: string | null;
  app_version: string | null;
  build_number: string | null;
  occurred_at: number;
  attempts: number;
};

const MAX_ANALYTICS_QUEUE_AGE_MS = 29 * 24 * 60 * 60 * 1000;

function fromRow(row: AnalyticsQueueRow): QueuedAnalyticsEvent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    eventName: row.event_name,
    source: row.source,
    feature: row.feature,
    plan: row.plan,
    result: row.result,
    exportKind: row.export_kind,
    appVersion: row.app_version,
    buildNumber: row.build_number,
    occurredAt: row.occurred_at,
    attempts: row.attempts,
  };
}

export async function enqueueAnalyticsEvent(
  db: SQLiteDatabase,
  event: Omit<QueuedAnalyticsEvent, "attempts">,
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO analytics_queue (
       id, owner_id, event_name, source, feature, plan, result, export_kind,
       app_version, build_number, occurred_at, available_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id,
    event.ownerId,
    event.eventName,
    event.source,
    event.feature,
    event.plan,
    event.result,
    event.exportKind,
    event.appVersion,
    event.buildNumber,
    event.occurredAt,
    event.occurredAt,
  );
}

export async function loadReadyAnalyticsEvents(
  db: SQLiteDatabase,
  ownerId: string,
  now: number = Date.now(),
  limit: number = 25,
): Promise<QueuedAnalyticsEvent[]> {
  // The server accepts events up to 30 days old. Remove them a day earlier so
  // an offline device cannot keep retrying an expired event and block the queue.
  await db.runAsync(
    "DELETE FROM analytics_queue WHERE owner_id = ? AND occurred_at < ?",
    ownerId,
    now - MAX_ANALYTICS_QUEUE_AGE_MS,
  );
  const rows = await db.getAllAsync<AnalyticsQueueRow>(
    `SELECT id, owner_id, event_name, source, feature, plan, result, export_kind,
            app_version, build_number, occurred_at, attempts
     FROM analytics_queue
     WHERE owner_id = ? AND available_at <= ?
     ORDER BY occurred_at, id
     LIMIT ?`,
    ownerId,
    now,
    Math.max(1, Math.min(limit, 50)),
  );
  return rows.map(fromRow);
}

export async function completeAnalyticsEvents(
  db: SQLiteDatabase,
  ownerId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM analytics_queue WHERE owner_id = ? AND id IN (${placeholders})`,
    ownerId,
    ...ids,
  );
}

export async function failAnalyticsEvent(
  db: SQLiteDatabase,
  event: Pick<QueuedAnalyticsEvent, "id" | "ownerId" | "attempts">,
  error: unknown,
  now: number = Date.now(),
): Promise<number> {
  const attempts = event.attempts + 1;
  const delay = Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts - 1, 9));
  const availableAt = now + delay;
  const message = error instanceof Error ? error.message : "analytics_upload_failed";
  await db.runAsync(
    `UPDATE analytics_queue
     SET attempts = ?, available_at = ?, last_error = ?
     WHERE owner_id = ? AND id = ?`,
    attempts,
    availableAt,
    message.slice(0, 300),
    event.ownerId,
    event.id,
  );
  return availableAt;
}
