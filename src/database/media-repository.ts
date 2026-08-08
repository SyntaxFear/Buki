import type { SQLiteDatabase } from "expo-sqlite";

export type LocalMediaKind = "cutout" | "preview" | "original";

export interface LocalMediaFile {
  id: string;
  ownerId: string;
  artworkId: string;
  kind: LocalMediaKind;
  localUri: string | null;
  remotePath: string | null;
  checksum: string | null;
  byteSize: number | null;
  mimeType: string | null;
  uploadState: string;
}

interface LocalMediaRow {
  id: string;
  owner_id: string;
  artwork_id: string;
  kind: string;
  local_uri: string | null;
  remote_path: string | null;
  checksum: string | null;
  byte_size: number | null;
  mime_type: string | null;
  upload_state: string;
}

function isMediaKind(value: string): value is LocalMediaKind {
  return value === "cutout" || value === "preview" || value === "original";
}

export async function loadLocalMediaFile(
  db: SQLiteDatabase,
  ownerId: string,
  mediaId: string,
): Promise<LocalMediaFile | null> {
  const row = await db.getFirstAsync<LocalMediaRow>(
    `SELECT media_files.id, media_files.owner_id, media_files.artwork_id, media_files.kind,
            media_files.local_uri, media_files.remote_path, media_files.checksum,
            media_files.byte_size, media_files.mime_type, media_files.upload_state
     FROM media_files
     JOIN artworks ON artworks.id = media_files.artwork_id
     WHERE media_files.owner_id = ? AND media_files.id = ?
       AND artworks.owner_id = ? AND artworks.deleted_at IS NULL`,
    ownerId,
    mediaId,
    ownerId,
  );
  if (!row || !isMediaKind(row.kind)) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    artworkId: row.artwork_id,
    kind: row.kind,
    localUri: row.local_uri,
    remotePath: row.remote_path,
    checksum: row.checksum,
    byteSize: row.byte_size,
    mimeType: row.mime_type,
    uploadState: row.upload_state,
  };
}

export async function markLocalMediaUploading(
  db: SQLiteDatabase,
  ownerId: string,
  mediaId: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE media_files
     SET upload_state = 'uploading', updated_at = ?
     WHERE owner_id = ? AND id = ?`,
    Date.now(),
    ownerId,
    mediaId,
  );
}

export async function markLocalMediaUploaded(
  db: SQLiteDatabase,
  input: {
    ownerId: string;
    mediaId: string;
    remotePath: string;
    checksum: string;
    byteSize: number;
    mimeType: string;
  },
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE media_files
       SET remote_path = ?, checksum = ?, byte_size = ?, mime_type = ?,
           upload_state = 'uploaded', updated_at = ?
       WHERE owner_id = ? AND id = ?`,
      input.remotePath,
      input.checksum,
      input.byteSize,
      input.mimeType,
      Date.now(),
      input.ownerId,
      input.mediaId,
    );
    await tx.runAsync(
      `UPDATE artworks
       SET media_missing = 0
       WHERE owner_id = ?
         AND id = (
           SELECT artwork_id FROM media_files
           WHERE owner_id = ? AND id = ? AND kind = 'cutout'
         )`,
      input.ownerId,
      input.ownerId,
      input.mediaId,
    );
  });
}

export async function markLocalMediaFailed(
  db: SQLiteDatabase,
  ownerId: string,
  mediaId: string,
  mediaMissing: boolean,
): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE media_files
       SET upload_state = 'failed', updated_at = ?
       WHERE owner_id = ? AND id = ?`,
      now,
      ownerId,
      mediaId,
    );
    if (mediaMissing) {
      await tx.runAsync(
        `UPDATE artworks
         SET media_missing = 1, updated_at = MAX(updated_at, ?)
         WHERE owner_id = ?
           AND id = (SELECT artwork_id FROM media_files WHERE owner_id = ? AND id = ?)`,
        now,
        ownerId,
        ownerId,
        mediaId,
      );
    }
  });
}

export async function saveLocalCloudUsage(
  db: SQLiteDatabase,
  ownerId: string,
  bytesUsed: number,
  bytesLimit: number,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO storage_usage (owner_id, bytes_used, bytes_limit, measured_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       bytes_used = excluded.bytes_used,
       bytes_limit = excluded.bytes_limit,
       measured_at = excluded.measured_at`,
    ownerId,
    Math.max(0, bytesUsed),
    Math.max(1, bytesLimit),
    Date.now(),
  );
}
