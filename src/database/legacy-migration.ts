import { File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { migrateStoreData } from "@/store/migrate";
import { buildLegacyMigrationRecords } from "./legacy-records";
import { DEFAULT_CHILD_ID, LEGACY_MIGRATION_KEY } from "./constants";
import { activePadPreferenceKey } from "./account-repository";

interface LegacySource {
  name: "buki.json" | "bloombook.json" | "none";
  raw: unknown;
}

function readLegacySource(): LegacySource {
  for (const name of ["buki.json", "bloombook.json"] as const) {
    try {
      const file = new File(Paths.document, name);
      if (file.exists) return { name, raw: JSON.parse(file.textSync()) };
    } catch (error) {
      console.warn(`Failed to read legacy ${name}`, error);
    }
  }
  return { name: "none", raw: null };
}

function localFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export async function migrateLegacyJson(db: SQLiteDatabase): Promise<void> {
  const completed = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = ?",
    LEGACY_MIGRATION_KEY,
  );
  if (completed?.value) return;

  const now = Date.now();
  const source = readLegacySource();
  const data = migrateStoreData(source.raw, now);
  const records = buildLegacyMigrationRecords(data, localFileExists);

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO child_profiles (
        id, owner_id, name, avatar_color, sort_order, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar_color = excluded.avatar_color,
        updated_at = excluded.updated_at`,
      records.child.id,
      records.child.name,
      records.child.avatarColor,
      records.child.createdAt,
      now,
    );

    for (const pad of records.sketchpads) {
      await tx.runAsync(
        `INSERT INTO sketchpads (
          id, owner_id, child_id, name, style, design, cover_color, page_color, border, decoration,
          sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
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
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        pad.id,
        pad.childId,
        pad.name,
        pad.style,
        pad.design,
        pad.coverColor,
        pad.pageColor ?? null,
        pad.border,
        pad.decoration,
        pad.sortOrder,
        pad.createdAt,
        now,
      );
    }

    for (const artwork of records.artworks) {
      await tx.runAsync(
        `INSERT INTO artworks (
          id, owner_id, child_id, sketchpad_id, cutout_uri, photo_uri, width,
          height, rotation, media_missing, added_at, updated_at, deleted_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
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
        artwork.id,
        artwork.childId,
        artwork.sketchpadId,
        artwork.uri,
        artwork.photoUri ?? null,
        artwork.width,
        artwork.height,
        artwork.rotation,
        artwork.mediaMissing ? 1 : 0,
        artwork.addedAt,
        now,
      );
    }

    await tx.runAsync(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      activePadPreferenceKey(null),
      data.activePadId,
      now,
    );

    const padCount = await tx.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sketchpads WHERE deleted_at IS NULL",
    );
    const artworkCount = await tx.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM artworks WHERE deleted_at IS NULL",
    );
    if (padCount?.count !== records.sketchpads.length || artworkCount?.count !== records.artworks.length) {
      throw new Error("Legacy migration validation failed");
    }

    await tx.runAsync(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      LEGACY_MIGRATION_KEY,
      JSON.stringify({
        source: source.name,
        childId: DEFAULT_CHILD_ID,
        sketchpads: records.sketchpads.length,
        artworks: records.artworks.length,
        completedAt: now,
      }),
      now,
    );
  });
}
