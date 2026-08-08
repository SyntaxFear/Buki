import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { migrateStoreData, type Drawing, type StoreData } from "@/store/migrate";
import { DEFAULT_CHILD_ID } from "./constants";
import { activeLocalOwnerId, activePadPreferenceKey } from "./account-repository";

interface SketchpadRow {
  id: string;
  child_id: string;
  name: string;
  style: string;
  design: string;
  cover_color: string;
  page_color: string | null;
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
  added_at: number;
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
    `SELECT id, child_id, name, style, design, cover_color, page_color, created_at
     FROM sketchpads
     WHERE deleted_at IS NULL AND ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
     ORDER BY sort_order, created_at`,
    ownerId,
    ownerId,
  );
  const artworks = await db.getAllAsync<ArtworkRow>(
    `SELECT id, sketchpad_id, cutout_uri, photo_uri, width, height, rotation, added_at
     FROM artworks
     WHERE deleted_at IS NULL AND ((? IS NULL AND owner_id IS NULL) OR owner_id = ?)
     ORDER BY added_at`,
    ownerId,
    ownerId,
  );
  const active = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    activePadPreferenceKey(ownerId),
  );

  const drawingsByPad: Record<string, Drawing[]> = Object.fromEntries(pads.map((pad) => [pad.id, []]));
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
    });
  }

  return migrateStoreData(
    {
      version: 3,
      activePadId: active?.value ?? pads[0]?.id,
      pads: pads.map((pad) => ({
        id: pad.id,
        childId: pad.child_id,
        name: pad.name,
        style: pad.style,
        design: pad.design,
        coverColor: pad.cover_color,
        pageColor: pad.page_color ?? undefined,
        createdAt: pad.created_at,
      })),
      drawingsByPad,
    },
    Date.now(),
  );
}

export async function saveLibrary(db: SQLiteDatabase, data: StoreData): Promise<void> {
  const now = Date.now();
  const ownerId = await activeLocalOwnerId(db);
  await db.withExclusiveTransactionAsync(async (tx) => {
    const artworkIds: string[] = [];
    for (const [sortOrder, pad] of data.pads.entries()) {
      await tx.runAsync(
        `INSERT INTO sketchpads (
          id, owner_id, child_id, name, style, design, cover_color, page_color,
          sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          child_id = excluded.child_id,
          name = excluded.name,
          style = excluded.style,
          design = excluded.design,
          cover_color = excluded.cover_color,
          page_color = excluded.page_color,
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
        sortOrder,
        pad.createdAt,
        now,
      );

      for (const drawing of data.drawingsByPad[pad.id] ?? []) {
        artworkIds.push(drawing.id);
        await tx.runAsync(
          `INSERT INTO artworks (
            id, owner_id, child_id, sketchpad_id, cutout_uri, photo_uri, width,
            height, rotation, media_missing, added_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET
            child_id = excluded.child_id,
            sketchpad_id = excluded.sketchpad_id,
            cutout_uri = excluded.cutout_uri,
            photo_uri = excluded.photo_uri,
            width = excluded.width,
            height = excluded.height,
            rotation = excluded.rotation,
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
          fileExists(drawing.uri) ? 0 : 1,
          drawing.addedAt,
          now,
        );

        await upsertMediaRows(tx, drawing, ownerId, now);
      }
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
  });
}

async function upsertMediaRows(
  db: SQLiteDatabase,
  drawing: Drawing,
  ownerId: string | null,
  now: number,
): Promise<void> {
  const rows = [
    { id: `${drawing.id}:cutout`, kind: "cutout", uri: drawing.uri, mime: "image/png" },
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
        byte_size = excluded.byte_size,
        mime_type = excluded.mime_type,
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
}
