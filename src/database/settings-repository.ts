import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { activeLocalOwnerId } from "./account-repository";

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

export async function getLocalUsage(db: SQLiteDatabase): Promise<{
  localBytes: number;
  cloudBytes: number;
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
    ? await db.getFirstAsync<{ bytes_used: number }>(
        "SELECT bytes_used FROM storage_usage WHERE owner_id = ?",
        ownerId,
      )
    : null;
  return { localBytes, cloudBytes: cloud?.bytes_used ?? 0 };
}
