import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import type { CloudRestoreResult, RemoteCloudSnapshot } from "@/sync/cloud-types";
import { activePadPreferenceKey } from "./account-repository";
import { enqueueLocalSyncOperation } from "./sync-repository";
import { artworkTagEntityId } from "./sync-serialization";

interface QueuedRelationRow {
  operation: string;
  entity_id: string;
  payload: string | null;
  updated_at: number;
}

interface QueuedTagRemapResult {
  removedKeys: string[];
  queuedOperations: Array<{ key: string; operation: string }>;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function parseArtworkTagEntityId(
  entityId: string,
): { artworkId: string; tagId: string } | null {
  const separator = entityId.indexOf("|");
  if (
    separator <= 0 ||
    separator !== entityId.lastIndexOf("|") ||
    separator === entityId.length - 1
  ) {
    return null;
  }
  try {
    const artworkId = decodeURIComponent(entityId.slice(0, separator));
    const tagId = decodeURIComponent(entityId.slice(separator + 1));
    return artworkId && tagId ? { artworkId, tagId } : null;
  } catch {
    return null;
  }
}

function queuePayload(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function remapQueuedTagReferences(
  db: SQLiteDatabase,
  ownerId: string,
  localTagId: string,
  remoteTagId: string,
): Promise<QueuedTagRemapResult> {
  if (localTagId === remoteTagId) return { removedKeys: [], queuedOperations: [] };
  const queuedRelations = await db.getAllAsync<QueuedRelationRow>(
    `SELECT operation, entity_id, payload, updated_at
     FROM sync_queue
     WHERE owner_id = ? AND entity_type = 'artwork_tag'`,
    ownerId,
  );
  const canonicalRows = new Map(
    queuedRelations.map((row) => [row.entity_id, row]),
  );
  const removedKeys = [`tag:${localTagId}`];
  const queuedOperations: Array<{ key: string; operation: string }> = [];

  await db.runAsync(
    "DELETE FROM sync_queue WHERE owner_id = ? AND entity_type = 'tag' AND entity_id = ?",
    ownerId,
    localTagId,
  );

  for (const row of queuedRelations) {
    const relation = parseArtworkTagEntityId(row.entity_id);
    if (!relation || relation.tagId !== localTagId) continue;
    const canonicalEntityId = artworkTagEntityId(relation.artworkId, remoteTagId);
    const canonical = canonicalRows.get(canonicalEntityId);
    removedKeys.push(`artwork_tag:${row.entity_id}`);
    await db.runAsync(
      `DELETE FROM sync_queue
       WHERE owner_id = ? AND entity_type = 'artwork_tag' AND entity_id = ?`,
      ownerId,
      row.entity_id,
    );
    if (canonical && canonical.updated_at >= row.updated_at) continue;
    if (row.operation !== "upsert" && row.operation !== "delete") continue;

    const now = Date.now();
    const currentPayload = queuePayload(row.payload);
    const payload = {
      ...currentPayload,
      owner_id: ownerId,
      artwork_id: relation.artworkId,
      tag_id: remoteTagId,
      ...(row.operation === "upsert"
        ? { created_at: currentPayload.created_at ?? new Date(now).toISOString() }
        : { deleted_at: currentPayload.deleted_at ?? new Date(now).toISOString() }),
    };
    await enqueueLocalSyncOperation(db, {
      ownerId,
      operation: row.operation,
      entityType: "artwork_tag",
      entityId: canonicalEntityId,
      payload,
      now,
    });
    queuedOperations.push({
      key: `artwork_tag:${canonicalEntityId}`,
      operation: row.operation,
    });
  }

  return { removedKeys, queuedOperations };
}

async function localMediaUris(db: SQLiteDatabase, ownerId?: string): Promise<Set<string>> {
  const ownerFilter = ownerId ? " WHERE owner_id = ?" : "";
  const ownerArgs = ownerId ? [ownerId] : [];
  const media = await db.getAllAsync<{ local_uri: string | null }>(
    `SELECT local_uri FROM media_files${ownerFilter}${ownerId ? " AND" : " WHERE"} local_uri IS NOT NULL`,
    ...ownerArgs,
  );
  const artworks = await db.getAllAsync<{
    cutout_uri: string;
    photo_uri: string | null;
    preview_uri: string | null;
  }>(
    `SELECT cutout_uri, photo_uri, preview_uri FROM artworks${ownerFilter}`,
    ...ownerArgs,
  );
  return new Set([
    ...media.flatMap((row) => (row.local_uri ? [row.local_uri] : [])),
    ...artworks.flatMap((row) => [row.cutout_uri, row.photo_uri, row.preview_uri].filter(Boolean) as string[]),
  ]);
}

function deleteUnreferencedFiles(before: Set<string>, after: Set<string>): void {
  for (const uri of before) {
    if (after.has(uri) || !uri.startsWith("file://")) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {}
  }
}

type OwnedRestoreTable =
  | "child_profiles"
  | "sketchpads"
  | "artworks"
  | "tags"
  | "media_files";

type RestoreIdsByTable = Record<OwnedRestoreTable, readonly string[]>;

const RESTORE_ID_QUERY_BATCH = 400;

export class CloudRestoreCollisionError extends Error {
  readonly code = "cross_account_id_collision";

  constructor(readonly table: OwnedRestoreTable) {
    super("Cloud backup identifiers conflict with another Buki account on this device.");
    this.name = "CloudRestoreCollisionError";
  }
}

export async function assertNoCrossAccountRestoreIds(
  db: SQLiteDatabase,
  ownerId: string,
  idsByTable: RestoreIdsByTable,
): Promise<void> {
  const entries = Object.entries(idsByTable) as [OwnedRestoreTable, readonly string[]][];
  for (const [table, rawIds] of entries) {
    const ids = [...new Set(rawIds.filter(Boolean))];
    for (let offset = 0; offset < ids.length; offset += RESTORE_ID_QUERY_BATCH) {
      const batch = ids.slice(offset, offset + RESTORE_ID_QUERY_BATCH);
      const collisions = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM ${table}
         WHERE (owner_id IS NULL OR owner_id <> ?)
           AND id IN (${batch.map(() => "?").join(",")})
         LIMIT 1`,
        ownerId,
        ...batch,
      );
      if (collisions.length > 0) throw new CloudRestoreCollisionError(table);
    }
  }
}

async function removeQueuedEntities(
  db: SQLiteDatabase,
  ownerId: string,
  entityType: string,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length === 0) return;
  const placeholders = entityIds.map(() => "?").join(",");
  await db.runAsync(
    `DELETE FROM sync_queue
     WHERE owner_id = ? AND entity_type = ? AND entity_id IN (${placeholders})`,
    ownerId,
    entityType,
    ...entityIds,
  );
}

async function clearQueuesForRemoteTombstone(
  db: SQLiteDatabase,
  ownerId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const artworkIds = entityType === "child_profile"
    ? (await db.getAllAsync<{ id: string }>(
        "SELECT id FROM artworks WHERE owner_id = ? AND child_id = ?",
        ownerId,
        entityId,
      )).map((row) => row.id)
    : entityType === "sketchpad"
      ? (await db.getAllAsync<{ id: string }>(
          "SELECT id FROM artworks WHERE owner_id = ? AND sketchpad_id = ?",
          ownerId,
          entityId,
        )).map((row) => row.id)
      : entityType === "artwork"
        ? [entityId]
        : [];
  const padIds = entityType === "child_profile"
    ? (await db.getAllAsync<{ id: string }>(
        "SELECT id FROM sketchpads WHERE owner_id = ? AND child_id = ?",
        ownerId,
        entityId,
      )).map((row) => row.id)
    : [];
  const mediaIds = artworkIds.length
    ? (await db.getAllAsync<{ id: string }>(
        `SELECT id FROM media_files
         WHERE owner_id = ? AND artwork_id IN (${artworkIds.map(() => "?").join(",")})`,
        ownerId,
        ...artworkIds,
      )).map((row) => row.id)
    : [];
  const relationIds = artworkIds.length
    ? (await db.getAllAsync<{ artwork_id: string; tag_id: string }>(
        `SELECT artwork_id, tag_id FROM artwork_tags
         WHERE artwork_id IN (${artworkIds.map(() => "?").join(",")})`,
        ...artworkIds,
      )).map((row) => artworkTagEntityId(row.artwork_id, row.tag_id))
    : entityType === "tag"
      ? (await db.getAllAsync<{ artwork_id: string; tag_id: string }>(
          "SELECT artwork_id, tag_id FROM artwork_tags WHERE tag_id = ?",
          entityId,
        )).map((row) => artworkTagEntityId(row.artwork_id, row.tag_id))
      : [];

  await removeQueuedEntities(db, ownerId, "artwork_tag", relationIds);
  await removeQueuedEntities(db, ownerId, "media_file", mediaIds);
  await removeQueuedEntities(db, ownerId, "artwork", artworkIds);
  await removeQueuedEntities(db, ownerId, "sketchpad", padIds);
  await removeQueuedEntities(db, ownerId, entityType, [entityId]);
}

export async function applyRemoteCloudSnapshot(
  db: SQLiteDatabase,
  ownerId: string,
  snapshot: RemoteCloudSnapshot,
): Promise<CloudRestoreResult> {
  const beforeOwnerUris = await localMediaUris(db, ownerId);
  const beforeAllUris = await localMediaUris(db);
  const snapshotUris = new Set(snapshot.mediaFiles.map((media) => media.local_uri));
  const tombstones = new Map(
    snapshot.tombstones
      .filter((row) => row.owner_id === ownerId)
      .map((row) => [`${row.entity_type}:${row.entity_id}`, row] as const),
  );
  const deletedChildIds = new Set(
    snapshot.tombstones
      .filter((row) => row.owner_id === ownerId && row.entity_type === "child_profile")
      .map((row) => row.entity_id),
  );
  const deletedPadIds = new Set(
    snapshot.tombstones
      .filter((row) => row.owner_id === ownerId && row.entity_type === "sketchpad")
      .map((row) => row.entity_id),
  );
  const deletedArtworkIds = new Set(
    snapshot.tombstones
      .filter((row) => row.owner_id === ownerId && row.entity_type === "artwork")
      .map((row) => row.entity_id),
  );
  const activeChildren = snapshot.children.filter(
    (row) => row.owner_id === ownerId && !row.deleted_at && !tombstones.has(`child_profile:${row.id}`),
  );
  const activePads = snapshot.sketchpads.filter(
    (row) => row.owner_id === ownerId
      && !row.deleted_at
      && !deletedChildIds.has(row.child_id)
      && !tombstones.has(`sketchpad:${row.id}`),
  );
  const activeTags = snapshot.tags.filter(
    (row) => row.owner_id === ownerId && !row.deleted_at && !tombstones.has(`tag:${row.id}`),
  );
  const activeMedia = snapshot.mediaFiles.filter(
    (row) => row.owner_id === ownerId
      && !row.deleted_at
      && !deletedArtworkIds.has(row.artwork_id)
      && !tombstones.has(`media_file:${row.id}`),
  );
  const mediaByArtwork = new Map<string, Map<string, (typeof activeMedia)[number]>>();
  for (const media of activeMedia) {
    const artworkMedia = mediaByArtwork.get(media.artwork_id) ?? new Map();
    artworkMedia.set(media.kind, media);
    mediaByArtwork.set(media.artwork_id, artworkMedia);
  }
  const activeArtworks = snapshot.artworks.filter(
    (row) => row.owner_id === ownerId
      && !row.deleted_at
      && !deletedChildIds.has(row.child_id)
      && !deletedPadIds.has(row.sketchpad_id)
      && !tombstones.has(`artwork:${row.id}`)
      && mediaByArtwork.get(row.id)?.has("cutout"),
  );
  const activeArtworkIds = new Set(activeArtworks.map((artwork) => artwork.id));
  const restorableMedia = activeMedia.filter((media) => activeArtworkIds.has(media.artwork_id));

  await db.withExclusiveTransactionAsync(async (tx) => {
    await assertNoCrossAccountRestoreIds(tx, ownerId, {
      child_profiles: [
        ...activeChildren.map((child) => child.id),
        ...activePads.map((pad) => pad.child_id),
        ...activeArtworks.map((artwork) => artwork.child_id),
      ],
      sketchpads: [
        ...activePads.map((pad) => pad.id),
        ...activeArtworks.map((artwork) => artwork.sketchpad_id),
      ],
      artworks: [
        ...activeArtworks.map((artwork) => artwork.id),
        ...restorableMedia.map((media) => media.artwork_id),
      ],
      tags: activeTags.map((tag) => tag.id),
      media_files: restorableMedia.map((media) => media.id),
    });
    const queuedRows = await tx.getAllAsync<{
      operation: string;
      entity_type: string;
      entity_id: string;
    }>(
      "SELECT operation, entity_type, entity_id FROM sync_queue WHERE owner_id = ?",
      ownerId,
    );
    const queuedOperation = new Map(
      queuedRows.map((row) => [`${row.entity_type}:${row.entity_id}`, row.operation]),
    );
    const pendingRelationArtworkIds = new Set(
      queuedRows
        .filter((row) => row.entity_type === "artwork_tag")
        .map((row) => {
          try {
            return decodeURIComponent(row.entity_id.split("|")[0] ?? "");
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    );
    const hasQueuedChange = (entityType: string, entityId: string) =>
      queuedOperation.has(`${entityType}:${entityId}`);

    for (const tombstone of tombstones.values()) {
      await clearQueuesForRemoteTombstone(tx, ownerId, tombstone.entity_type, tombstone.entity_id);
      if (tombstone.entity_type === "media_file") {
        await tx.runAsync("DELETE FROM media_files WHERE owner_id = ? AND id = ?", ownerId, tombstone.entity_id);
      } else if (tombstone.entity_type === "artwork") {
        await tx.runAsync("DELETE FROM artworks WHERE owner_id = ? AND id = ?", ownerId, tombstone.entity_id);
      } else if (tombstone.entity_type === "sketchpad") {
        await tx.runAsync("DELETE FROM sketchpads WHERE owner_id = ? AND id = ?", ownerId, tombstone.entity_id);
      } else if (tombstone.entity_type === "child_profile") {
        await tx.runAsync("DELETE FROM child_profiles WHERE owner_id = ? AND id = ?", ownerId, tombstone.entity_id);
      } else if (tombstone.entity_type === "tag") {
        await tx.runAsync("DELETE FROM tags WHERE owner_id = ? AND id = ?", ownerId, tombstone.entity_id);
      }
      await tx.runAsync(
        `INSERT INTO tombstones (id, owner_id, entity_type, entity_id, deleted_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET
           deleted_at = MAX(tombstones.deleted_at, excluded.deleted_at),
           synced_at = excluded.synced_at`,
        `tombstone:${ownerId}:${tombstone.entity_type}:${tombstone.entity_id}`,
        ownerId,
        tombstone.entity_type,
        tombstone.entity_id,
        timestamp(tombstone.deleted_at),
        Date.now(),
      );
    }

    if (snapshot.adult?.owner_id === ownerId && !hasQueuedChange("adult_profile", ownerId)) {
      await tx.runAsync(
        `INSERT INTO adult_profiles (id, display_name, email, avatar_uri, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           display_name = excluded.display_name,
           email = excluded.email,
           avatar_uri = excluded.avatar_uri,
           updated_at = excluded.updated_at`,
        ownerId,
        snapshot.adult.display_name,
        snapshot.adult.email,
        snapshot.adult.avatar_url,
        timestamp(snapshot.adult.created_at),
        timestamp(snapshot.adult.updated_at),
      );
    }

    for (const child of activeChildren) {
      if (hasQueuedChange("child_profile", child.id)) continue;
      await tx.runAsync(
        `INSERT INTO child_profiles (
          id, owner_id, name, avatar_color, avatar_uri, birth_month, birth_year,
          sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          owner_id = excluded.owner_id,
          name = excluded.name,
          avatar_color = excluded.avatar_color,
          avatar_uri = excluded.avatar_uri,
          birth_month = excluded.birth_month,
          birth_year = excluded.birth_year,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        child.id,
        ownerId,
        child.name,
        child.avatar_color,
        child.avatar_url,
        child.birth_month,
        child.birth_year,
        child.sort_order,
        timestamp(child.created_at),
        timestamp(child.updated_at),
      );
    }

    for (const pad of activePads) {
      if (hasQueuedChange("sketchpad", pad.id)) continue;
      await tx.runAsync(
        `INSERT INTO sketchpads (
          id, owner_id, child_id, name, style, design, cover_color, page_color,
          border, decoration, sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          owner_id = excluded.owner_id,
          child_id = excluded.child_id,
          name = excluded.name,
          style = excluded.style,
          design = excluded.design,
          cover_color = excluded.cover_color,
          page_color = excluded.page_color,
          border = excluded.border,
          decoration = excluded.decoration,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        pad.id,
        ownerId,
        pad.child_id,
        pad.name,
        pad.style,
        pad.design,
        pad.cover_color,
        pad.page_color,
        pad.border,
        pad.decoration,
        pad.sort_order,
        timestamp(pad.created_at),
        timestamp(pad.updated_at),
      );
    }

    for (const artwork of activeArtworks) {
      if (hasQueuedChange("artwork", artwork.id)) continue;
      const media = mediaByArtwork.get(artwork.id)!;
      const cutout = media.get("cutout")!;
      const preview = media.get("preview");
      const original = media.get("original");
      await tx.runAsync(
        `INSERT INTO artworks (
          id, owner_id, child_id, sketchpad_id, cutout_uri, photo_uri, preview_uri,
          width, height, rotation, title, notes, favorite, media_missing,
          added_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          owner_id = excluded.owner_id,
          child_id = excluded.child_id,
          sketchpad_id = excluded.sketchpad_id,
          cutout_uri = excluded.cutout_uri,
          photo_uri = excluded.photo_uri,
          preview_uri = excluded.preview_uri,
          width = excluded.width,
          height = excluded.height,
          rotation = excluded.rotation,
          title = excluded.title,
          notes = excluded.notes,
          favorite = excluded.favorite,
          media_missing = 0,
          added_at = excluded.added_at,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        artwork.id,
        ownerId,
        artwork.child_id,
        artwork.sketchpad_id,
        cutout.local_uri,
        original?.local_uri ?? null,
        preview?.local_uri ?? null,
        artwork.width,
        artwork.height,
        artwork.rotation,
        artwork.title,
        artwork.notes,
        artwork.favorite ? 1 : 0,
        timestamp(artwork.added_at),
        timestamp(artwork.updated_at),
      );
    }

    for (const tag of activeTags) {
      if (hasQueuedChange("tag", tag.id)) continue;
      const conflictingTag = await tx.getFirstAsync<{ id: string }>(
        `SELECT id FROM tags
         WHERE owner_id = ? AND normalized_name = ? AND id <> ? AND deleted_at IS NULL
         LIMIT 1`,
        ownerId,
        tag.normalized_name,
        tag.id,
      );
      const preservedArtworkIds = conflictingTag
        ? await tx.getAllAsync<{ artwork_id: string }>(
            "SELECT artwork_id FROM artwork_tags WHERE tag_id = ?",
            conflictingTag.id,
          )
        : [];
      if (conflictingTag) {
        const remappedQueue = await remapQueuedTagReferences(
          tx,
          ownerId,
          conflictingTag.id,
          tag.id,
        );
        for (const key of remappedQueue.removedKeys) queuedOperation.delete(key);
        for (const queued of remappedQueue.queuedOperations) {
          queuedOperation.set(queued.key, queued.operation);
        }
        await tx.runAsync("DELETE FROM tags WHERE owner_id = ? AND id = ?", ownerId, conflictingTag.id);
      }
      await tx.runAsync(
        `INSERT INTO tags (
          id, owner_id, name, normalized_name, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          owner_id = excluded.owner_id,
          name = excluded.name,
          normalized_name = excluded.normalized_name,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        tag.id,
        ownerId,
        tag.name,
        tag.normalized_name,
        timestamp(tag.created_at),
        timestamp(tag.updated_at),
      );
      for (const relation of preservedArtworkIds) {
        await tx.runAsync(
          `INSERT OR IGNORE INTO artwork_tags (artwork_id, tag_id, created_at)
           VALUES (?, ?, ?)`,
          relation.artwork_id,
          tag.id,
          Date.now(),
        );
      }
    }

    const localArtworkIds = new Set(
      (await tx.getAllAsync<{ id: string }>(
        "SELECT id FROM artworks WHERE owner_id = ? AND deleted_at IS NULL",
        ownerId,
      )).map((row) => row.id),
    );
    const reconciledArtworkIds = activeArtworks
      .map((artwork) => artwork.id)
      .filter((artworkId) => localArtworkIds.has(artworkId) && !pendingRelationArtworkIds.has(artworkId));
    if (reconciledArtworkIds.length > 0) {
      const placeholders = reconciledArtworkIds.map(() => "?").join(",");
      await tx.runAsync(
        `DELETE FROM artwork_tags WHERE artwork_id IN (${placeholders})`,
        ...reconciledArtworkIds,
      );
    }
    const reconciledArtworkIdSet = new Set(reconciledArtworkIds);
    const tagIds = new Set(
      (await tx.getAllAsync<{ id: string }>(
        "SELECT id FROM tags WHERE owner_id = ? AND deleted_at IS NULL",
        ownerId,
      )).map((row) => row.id),
    );
    for (const relation of snapshot.artworkTags) {
      if (
        relation.owner_id !== ownerId
        || !reconciledArtworkIdSet.has(relation.artwork_id)
        || !tagIds.has(relation.tag_id)
        || hasQueuedChange("artwork_tag", artworkTagEntityId(relation.artwork_id, relation.tag_id))
      ) continue;
      await tx.runAsync(
        `INSERT OR REPLACE INTO artwork_tags (artwork_id, tag_id, created_at)
         VALUES (?, ?, ?)`,
        relation.artwork_id,
        relation.tag_id,
        timestamp(relation.created_at),
      );
    }

    for (const media of restorableMedia) {
      if (!localArtworkIds.has(media.artwork_id) || hasQueuedChange("media_file", media.id)) continue;
      await tx.runAsync(
        `INSERT INTO media_files (
          id, owner_id, artwork_id, kind, local_uri, remote_path, checksum,
          byte_size, mime_type, upload_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          owner_id = excluded.owner_id,
          artwork_id = excluded.artwork_id,
          kind = excluded.kind,
          local_uri = excluded.local_uri,
          remote_path = excluded.remote_path,
          checksum = excluded.checksum,
          byte_size = excluded.byte_size,
          mime_type = excluded.mime_type,
          upload_state = 'uploaded',
          updated_at = excluded.updated_at`,
        media.id,
        ownerId,
        media.artwork_id,
        media.kind,
        media.local_uri,
        media.storage_path,
        media.checksum,
        media.byte_size,
        media.mime_type,
        timestamp(media.created_at),
        timestamp(media.updated_at),
      );
    }

    await tx.runAsync(
      `INSERT INTO storage_usage (owner_id, bytes_used, bytes_limit, measured_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET
         bytes_used = excluded.bytes_used,
         bytes_limit = excluded.bytes_limit,
         measured_at = excluded.measured_at`,
      ownerId,
      snapshot.cloudBytes,
      snapshot.cloudLimit,
      Date.now(),
    );

    const firstChild = activeChildren[0]?.id;
    const firstPad = activePads[0]?.id;
    for (const [key, value] of [
      [`active_child_id:${ownerId}`, firstChild],
      [activePadPreferenceKey(ownerId), firstPad],
      [`onboarding_complete:${ownerId}`, firstChild && firstPad ? "true" : undefined],
    ] as const) {
      if (!value) continue;
      await tx.runAsync(
        `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO NOTHING`,
        key,
        value,
        Date.now(),
      );
    }
  }).catch((error) => {
    deleteUnreferencedFiles(snapshotUris, beforeAllUris);
    throw error;
  });

  const afterUris = await localMediaUris(db);
  deleteUnreferencedFiles(
    new Set([...beforeOwnerUris, ...snapshotUris]),
    afterUris,
  );
  return {
    children: activeChildren.length,
    sketchpads: activePads.length,
    artworks: activeArtworks.length,
    mediaFiles: restorableMedia.length,
    failedMediaCount: snapshot.failedMediaCount,
    restoredAt: new Date().toISOString(),
  };
}
