import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  activeLocalOwnerId,
  padIdFromViewedUnitPreferenceKey,
  viewedUnitPreferenceKey,
} from "./account-repository";

function scopedKey(name: string, ownerId: string | null): string {
  return `${name}:${ownerId ?? "local"}`;
}

export async function getBooleanPreference(
  db: SQLiteDatabase,
  name: string,
  fallback: boolean,
): Promise<boolean> {
  const ownerId = await activeLocalOwnerId(db);
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    scopedKey(name, ownerId),
  );
  return row ? row.value === "true" : fallback;
}

export async function setBooleanPreference(
  db: SQLiteDatabase,
  name: string,
  value: boolean,
): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  await db.runAsync(
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    scopedKey(name, ownerId),
    value ? "true" : "false",
    Date.now(),
  );
}

export async function getSketchpadViewedUnits(
  db: SQLiteDatabase,
): Promise<Record<string, number>> {
  const ownerId = await activeLocalOwnerId(db);
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM preferences WHERE key LIKE 'viewed_unit:%'",
  );
  const viewedUnits: Record<string, number> = {};
  for (const row of rows) {
    const padId = padIdFromViewedUnitPreferenceKey(row.key, ownerId);
    const unit = Number(row.value);
    if (!padId || !Number.isSafeInteger(unit) || unit < 0) continue;
    viewedUnits[padId] = unit;
  }
  return viewedUnits;
}

export async function setSketchpadViewedUnit(
  db: SQLiteDatabase,
  padId: string,
  unit: number,
): Promise<void> {
  if (!padId || !Number.isSafeInteger(unit) || unit < 0) return;
  const ownerId = await activeLocalOwnerId(db);
  const pad = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM sketchpads
     WHERE id = ? AND deleted_at IS NULL
       AND ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)`,
    padId,
    ownerId,
    ownerId,
  );
  if (!pad) return;
  await db.runAsync(
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    viewedUnitPreferenceKey(ownerId, padId),
    String(unit),
    Date.now(),
  );
}

export async function getLocalUsage(db: SQLiteDatabase): Promise<{
  localBytes: number;
  cloudBytes: number;
  cloudLimit: number;
}> {
  const ownerId = await activeLocalOwnerId(db);
  const localRows = await db.getAllAsync<{ cutout_uri: string; photo_uri: string | null }>(
    `SELECT cutout_uri, photo_uri FROM artworks
     WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)`,
    ownerId,
    ownerId,
  );
  const uris = new Set(
    localRows.flatMap((row) => [row.cutout_uri, row.photo_uri].filter(Boolean) as string[]),
  );
  let localBytes = 0;
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) localBytes += file.size;
    } catch {}
  }
  const cloud = ownerId
    ? await db.getFirstAsync<{ bytes_used: number; bytes_limit: number }>(
        "SELECT bytes_used, bytes_limit FROM storage_usage WHERE owner_id = ?",
        ownerId,
      )
    : null;
  return {
    localBytes,
    cloudBytes: cloud?.bytes_used ?? 0,
    cloudLimit: cloud?.bytes_limit ?? 2 * 1024 * 1024 * 1024,
  };
}
