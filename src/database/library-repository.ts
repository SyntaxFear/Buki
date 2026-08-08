import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { migrateStoreData, type Drawing, type StoreData } from "@/store/migrate";
import { DEFAULT_CHILD_ID } from "./constants";
import { activeLocalOwnerId, activePadPreferenceKey } from "./account-repository";
import {
  artworkTagEntityId,
  enqueueCurrentArtwork,
  enqueueCurrentArtworkTag,
  enqueueCurrentMediaFile,
  enqueueCurrentSketchpad,
  enqueueCurrentTag,
  enqueueEntityDeletion,
} from "./sync-serialization";

interface SketchpadRow {
  id: string;
  child_id: string;
  name: string;
  style: string;
  design: string;
  cover_color: string;
  page_color: string | null;
  border: string;
  decoration: string;
  created_at: number;
}

interface ArtworkRow {
  id: string;
  sketchpad_id: string;
  cutout_uri: string;
  photo_uri: string | null;
  width: number;
  height: number;
  rotation: number;
  title: string | null;
  notes: string | null;
  favorite: number;
  added_at: number;
  updated_at: number;
}

interface ArtworkTagRow {
  artwork_id: string;
  name: string;
}

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

function fileSize(uri: string): number | null {
  try {
    return new File(uri).size;
  } catch {
    return null;
  }
}

export async function loadLibrary(db: SQLiteDatabase): Promise<StoreData> {
  const ownerId = await activeLocalOwnerId(db);
  const pads = await db.getAllAsync<SketchpadRow>(
    `SELECT id, child_id, name, style, design, cover_color, page_color, border, decoration, created_at
     FROM sketchpads
     WHERE deleted_at IS NULL AND ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
     ORDER BY sort_order, created_at`,
    ownerId,
    ownerId,
  );
  const artworks = await db.getAllAsync<ArtworkRow>(
    `SELECT id, sketchpad_id, cutout_uri, photo_uri, width, height, rotation,
            title, notes, favorite, added_at, updated_at
     FROM artworks
     WHERE deleted_at IS NULL AND ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
     ORDER BY added_at`,
    ownerId,
    ownerId,
  );
  const tagRows = await db.getAllAsync<ArtworkTagRow>(
    `SELECT artwork_tags.artwork_id, tags.name
     FROM artwork_tags
     JOIN tags ON tags.id = artwork_tags.tag_id
     WHERE tags.deleted_at IS NULL
       AND ((? IS NULL AND tags.owner_id IS NULL) OR tags.owner_id = ?)
     ORDER BY tags.name COLLATE NOCASE`,
    ownerId,
    ownerId,
  );
  const active = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    activePadPreferenceKey(ownerId),
  );

  const drawingsByPad: Record<string, Drawing[]> = Object.fromEntries(pads.map((pad) => [pad.id, []]));
  const tagsByArtwork = new Map<string, string[]>();
  for (const row of tagRows) {
    const tags = tagsByArtwork.get(row.artwork_id) ?? [];
    tags.push(row.name);
    tagsByArtwork.set(row.artwork_id, tags);
  }
  for (const artwork of artworks) {
    const drawings = drawingsByPad[artwork.sketchpad_id];
    if (!drawings) continue;
    drawings.push({
      id: artwork.id,
      uri: artwork.cutout_uri,
      photoUri: artwork.photo_uri ?? undefined,
      width: artwork.width,
      height: artwork.height,
      rotation: artwork.rotation,
      addedAt: artwork.added_at,
      title: artwork.title ?? undefined,
      notes: artwork.notes ?? undefined,
      favorite: artwork.favorite === 1,
      tags: tagsByArtwork.get(artwork.id) ?? [],
      updatedAt: artwork.updated_at,
    });
  }

  return migrateStoreData(
    {
      version: 5,
      activePadId: active?.value ?? pads[0]?.id,
      pads: pads.map((pad) => ({
        id: pad.id,
        childId: pad.child_id,
        name: pad.name,
        style: pad.style,
        design: pad.design,
        border: pad.border,
        decoration: pad.decoration,
        coverColor: pad.cover_color,
        pageColor: pad.page_color ?? undefined,
        createdAt: pad.created_at,
      })),
      drawingsByPad,
    },
    Date.now(),
  );
}

export async function saveLibrary(
  db: SQLiteDatabase,
  data: StoreData,
  assertWriteAllowed?: () => void,
): Promise<void> {
  const now = Date.now();
  const ownerId = await activeLocalOwnerId(db);
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existingPadIds = ownerId
      ? new Set((await tx.getAllAsync<{ id: string }>("SELECT id FROM sketchpads WHERE owner_id = ?", ownerId)).map((row) => row.id))
      : new Set<string>();
    const existingArtworkIds = ownerId
      ? new Set((await tx.getAllAsync<{ id: string }>("SELECT id FROM artworks WHERE owner_id = ?", ownerId)).map((row) => row.id))
      : new Set<string>();
    const existingTagIds = ownerId
      ? new Set((await tx.getAllAsync<{ id: string }>("SELECT id FROM tags WHERE owner_id = ?", ownerId)).map((row) => row.id))
      : new Set<string>();
    const existingMediaIds = ownerId
      ? new Set((await tx.getAllAsync<{ id: string }>("SELECT id FROM media_files WHERE owner_id = ?", ownerId)).map((row) => row.id))
      : new Set<string>();
    const existingRelations = ownerId
      ? await tx.getAllAsync<{ artwork_id: string; tag_id: string }>(
          `SELECT artwork_tags.artwork_id, artwork_tags.tag_id
           FROM artwork_tags
           JOIN artworks ON artworks.id = artwork_tags.artwork_id
           JOIN tags ON tags.id = artwork_tags.tag_id
           WHERE artworks.owner_id = ? AND tags.owner_id = ?`,
          ownerId,
          ownerId,
        )
      : [];
    assertWriteAllowed?.();
    const nextRelationIds = new Set<string>();
    const nextMediaIds = new Set<string>();
    const artworkIds: string[] = [];
    for (const [sortOrder, pad] of data.pads.entries()) {
      await tx.runAsync(
        `INSERT INTO sketchpads (
          id, owner_id, child_id, name, style, design, cover_color, page_color, border, decoration,
          sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
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
        pad.childId || DEFAULT_CHILD_ID,
        pad.name,
        pad.style,
        pad.design,
        pad.coverColor,
        pad.pageColor ?? null,
        pad.border,
        pad.decoration,
        sortOrder,
        pad.createdAt,
        now,
      );
      if (ownerId) await enqueueCurrentSketchpad(tx, ownerId, pad.id);

      for (const drawing of data.drawingsByPad[pad.id] ?? []) {
        artworkIds.push(drawing.id);
        await tx.runAsync(
          `INSERT INTO artworks (
            id, owner_id, child_id, sketchpad_id, cutout_uri, photo_uri, width,
            height, rotation, title, notes, favorite, media_missing, added_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET
            child_id = excluded.child_id,
            sketchpad_id = excluded.sketchpad_id,
            cutout_uri = excluded.cutout_uri,
            photo_uri = excluded.photo_uri,
            width = excluded.width,
            height = excluded.height,
            rotation = excluded.rotation,
            title = excluded.title,
            notes = excluded.notes,
            favorite = excluded.favorite,
            media_missing = excluded.media_missing,
            added_at = excluded.added_at,
            updated_at = excluded.updated_at,
            deleted_at = NULL`,
          drawing.id,
          ownerId,
          pad.childId || DEFAULT_CHILD_ID,
          pad.id,
          drawing.uri,
          drawing.photoUri ?? null,
          drawing.width,
          drawing.height,
          drawing.rotation,
          drawing.title?.trim() || null,
          drawing.notes?.trim() || null,
          drawing.favorite ? 1 : 0,
          fileExists(drawing.uri) ? 0 : 1,
          drawing.addedAt,
          drawing.updatedAt ?? drawing.addedAt,
        );

        const tagIds = await replaceArtworkTags(tx, drawing, ownerId, now);
        const mediaIds = await upsertMediaRows(tx, drawing, ownerId, now);
        for (const mediaId of mediaIds) nextMediaIds.add(mediaId);
        if (ownerId) {
          await enqueueCurrentArtwork(tx, ownerId, drawing.id);
          for (const mediaId of mediaIds) {
            await enqueueCurrentMediaFile(tx, ownerId, mediaId);
          }
          for (const tagId of tagIds) {
            nextRelationIds.add(artworkTagEntityId(drawing.id, tagId));
            await enqueueCurrentTag(tx, ownerId, tagId);
            await enqueueCurrentArtworkTag(tx, ownerId, drawing.id, tagId);
          }
        }
      }
    }

    if (ownerId) {
      for (const mediaId of existingMediaIds) {
        if (!nextMediaIds.has(mediaId)) {
          await enqueueEntityDeletion(tx, ownerId, "media_file", mediaId);
        }
      }
      const nextArtworkIds = new Set(artworkIds);
      for (const artworkId of existingArtworkIds) {
        if (!nextArtworkIds.has(artworkId)) {
          await enqueueEntityDeletion(tx, ownerId, "artwork", artworkId);
        }
      }
      const nextPadIds = new Set(data.pads.map((pad) => pad.id));
      for (const padId of existingPadIds) {
        if (!nextPadIds.has(padId)) {
          await enqueueEntityDeletion(tx, ownerId, "sketchpad", padId);
        }
      }
      for (const relation of existingRelations) {
        const relationId = artworkTagEntityId(relation.artwork_id, relation.tag_id);
        if (!nextRelationIds.has(relationId)) {
          await enqueueEntityDeletion(tx, ownerId, "artwork_tag", relationId, {
            artwork_id: relation.artwork_id,
            tag_id: relation.tag_id,
          });
        }
      }
    }

    if (nextMediaIds.size === 0) {
      await tx.runAsync(
        "DELETE FROM media_files WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)",
        ownerId,
        ownerId,
      );
    } else {
      const mediaPlaceholders = [...nextMediaIds].map(() => "?").join(",");
      await tx.runAsync(
        `DELETE FROM media_files
         WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
           AND id NOT IN (${mediaPlaceholders})`,
        ownerId,
        ownerId,
        ...nextMediaIds,
      );
    }

    if (artworkIds.length === 0) {
      await tx.runAsync(
        "DELETE FROM artworks WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)",
        ownerId,
        ownerId,
      );
    } else {
      const placeholders = artworkIds.map(() => "?").join(",");
      await tx.runAsync(
        `DELETE FROM artworks WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?) AND id NOT IN (${placeholders})`,
        ownerId,
        ownerId,
        ...artworkIds,
      );
    }

    const padIds = data.pads.map((pad) => pad.id);
    const padPlaceholders = padIds.map(() => "?").join(",");
    await tx.runAsync(
      `DELETE FROM sketchpads WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?) AND id NOT IN (${padPlaceholders})`,
      ownerId,
      ownerId,
      ...padIds,
    );

    await tx.runAsync(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      activePadPreferenceKey(ownerId),
      data.activePadId,
      now,
    );

    await tx.runAsync(
      `DELETE FROM tags
       WHERE ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
         AND id NOT IN (SELECT tag_id FROM artwork_tags)`,
      ownerId,
      ownerId,
    );

    if (ownerId) {
      const remainingTagIds = new Set(
        (await tx.getAllAsync<{ id: string }>("SELECT id FROM tags WHERE owner_id = ?", ownerId)).map((row) => row.id),
      );
      for (const tagId of existingTagIds) {
        if (!remainingTagIds.has(tagId)) {
          await enqueueEntityDeletion(tx, ownerId, "tag", tagId);
        }
      }
    }
  });
}

async function replaceArtworkTags(
  db: SQLiteDatabase,
  drawing: Drawing,
  ownerId: string | null,
  now: number,
): Promise<string[]> {
  const tagIds: string[] = [];
  await db.runAsync("DELETE FROM artwork_tags WHERE artwork_id = ?", drawing.id);
  for (const name of drawing.tags ?? []) {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (!normalizedName) continue;
    let tag = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM tags
       WHERE normalized_name = ?
         AND ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
         AND deleted_at IS NULL
       LIMIT 1`,
      normalizedName,
      ownerId,
      ownerId,
    );
    if (!tag) {
      const id = `tag-${now}-${Math.random().toString(36).slice(2, 9)}`;
      await db.runAsync(
        `INSERT INTO tags (
          id, owner_id, name, normalized_name, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        id,
        ownerId,
        name.trim(),
        normalizedName,
        now,
        now,
      );
      tag = { id };
    }
    await db.runAsync(
      `INSERT OR IGNORE INTO artwork_tags (artwork_id, tag_id, created_at)
       VALUES (?, ?, ?)`,
      drawing.id,
      tag.id,
      now,
    );
    tagIds.push(tag.id);
  }
  return tagIds;
}

async function upsertMediaRows(
  db: SQLiteDatabase,
  drawing: Drawing,
  ownerId: string | null,
  now: number,
): Promise<string[]> {
  const rows = [
    { id: `${drawing.id}:cutout`, kind: "cutout", uri: drawing.uri, mime: "image/png" },
    { id: `${drawing.id}:preview`, kind: "preview", uri: drawing.uri, mime: "image/png" },
    ...(drawing.photoUri
      ? [{ id: `${drawing.id}:original`, kind: "original", uri: drawing.photoUri, mime: "image/jpeg" }]
      : []),
  ];

  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO media_files (
        id, owner_id, artwork_id, kind, local_uri, byte_size, mime_type, upload_state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        local_uri = excluded.local_uri,
        remote_path = CASE
          WHEN media_files.local_uri IS NOT excluded.local_uri THEN NULL
          ELSE media_files.remote_path
        END,
        checksum = CASE
          WHEN media_files.local_uri IS NOT excluded.local_uri THEN NULL
          ELSE media_files.checksum
        END,
        byte_size = CASE
          WHEN media_files.local_uri IS NOT excluded.local_uri THEN excluded.byte_size
          ELSE COALESCE(media_files.byte_size, excluded.byte_size)
        END,
        mime_type = CASE
          WHEN media_files.local_uri IS NOT excluded.local_uri THEN excluded.mime_type
          ELSE COALESCE(media_files.mime_type, excluded.mime_type)
        END,
        upload_state = CASE
          WHEN media_files.local_uri IS NOT excluded.local_uri OR media_files.upload_state = 'failed' THEN 'local'
          ELSE media_files.upload_state
        END,
        updated_at = excluded.updated_at`,
      row.id,
      ownerId,
      drawing.id,
      row.kind,
      row.uri,
      fileSize(row.uri),
      row.mime,
      drawing.addedAt,
      now,
    );
  }
  return rows.map((row) => row.id);
}
