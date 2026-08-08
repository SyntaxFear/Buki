import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { ACTIVE_OWNER_KEY } from "./account-repository";
import { enqueueFullAccountSnapshot } from "./sync-serialization";

async function ownerMediaUris(db: SQLiteDatabase, ownerId: string): Promise<Set<string>> {
  const media = await db.getAllAsync<{ local_uri: string | null }>(
    "SELECT local_uri FROM media_files WHERE owner_id = ? AND local_uri IS NOT NULL",
    ownerId,
  );
  const artworks = await db.getAllAsync<{
    cutout_uri: string;
    photo_uri: string | null;
    preview_uri: string | null;
  }>(
    "SELECT cutout_uri, photo_uri, preview_uri FROM artworks WHERE owner_id = ?",
    ownerId,
  );
  return new Set([
    ...media.flatMap((row) => row.local_uri ? [row.local_uri] : []),
    ...artworks.flatMap((row) => [row.cutout_uri, row.photo_uri, row.preview_uri].filter(Boolean) as string[]),
  ]);
}

async function allReferencedMediaUris(db: SQLiteDatabase): Promise<Set<string>> {
  const media = await db.getAllAsync<{ local_uri: string | null }>(
    "SELECT local_uri FROM media_files WHERE local_uri IS NOT NULL",
  );
  const artworks = await db.getAllAsync<{
    cutout_uri: string;
    photo_uri: string | null;
    preview_uri: string | null;
  }>("SELECT cutout_uri, photo_uri, preview_uri FROM artworks");
  return new Set([
    ...media.flatMap((row) => row.local_uri ? [row.local_uri] : []),
    ...artworks.flatMap((row) => [row.cutout_uri, row.photo_uri, row.preview_uri].filter(Boolean) as string[]),
  ]);
}

function deleteFiles(uris: Set<string>, retained: Set<string>): number {
  let failedFileCount = 0;
  for (const uri of uris) {
    if (retained.has(uri) || !uri.startsWith("file://")) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      failedFileCount += 1;
    }
  }
  return failedFileCount;
}

export async function deleteLocalAccountData(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<{ failedFileCount: number }> {
  const uris = await ownerMediaUris(db, ownerId);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `DELETE FROM preferences
       WHERE key IN ('active_pad_id', 'active_pad_id:local')
         AND value IN (SELECT id FROM sketchpads WHERE owner_id = ?)`,
      ownerId,
    );
    await tx.runAsync(
      `DELETE FROM artwork_tags
       WHERE artwork_id IN (SELECT id FROM artworks WHERE owner_id = ?)
          OR tag_id IN (SELECT id FROM tags WHERE owner_id = ?)`,
      ownerId,
      ownerId,
    );
    for (const table of [
      "sync_queue",
      "tombstones",
      "media_files",
      "artworks",
      "sketchpads",
      "child_profiles",
      "tags",
      "entitlement_snapshots",
      "storage_usage",
    ]) {
      await tx.runAsync(`DELETE FROM ${table} WHERE owner_id = ?`, ownerId);
    }
    await tx.runAsync("DELETE FROM adult_profiles WHERE id = ?", ownerId);
    await tx.runAsync(
      "DELETE FROM preferences WHERE key LIKE ? OR (key = ? AND value = ?)",
      `%:${ownerId}`,
      ACTIVE_OWNER_KEY,
      ownerId,
    );
  });
  return {
    failedFileCount: deleteFiles(uris, await allReferencedMediaUris(db)),
  };
}

export async function resetLocalCloudState(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM sync_queue WHERE owner_id = ?", ownerId);
    await tx.runAsync("DELETE FROM tombstones WHERE owner_id = ?", ownerId);
    await tx.runAsync(
      `UPDATE media_files
       SET remote_path = NULL, upload_state = 'local', updated_at = ?
       WHERE owner_id = ?`,
      now,
      ownerId,
    );
    await tx.runAsync(
      `INSERT INTO storage_usage (owner_id, bytes_used, bytes_limit, measured_at)
       VALUES (?, 0, 2147483648, ?)
       ON CONFLICT(owner_id) DO UPDATE SET bytes_used = 0, measured_at = excluded.measured_at`,
      ownerId,
      now,
    );
    await tx.runAsync(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, 'false', ?)
       ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = excluded.updated_at`,
      `automatic_backup:${ownerId}`,
      now,
    );
    await tx.runAsync("DELETE FROM preferences WHERE key = ?", `last_sync_at:${ownerId}`);
    await enqueueFullAccountSnapshot(tx, ownerId);
  });
}
