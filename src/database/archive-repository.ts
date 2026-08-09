import type { SQLiteDatabase } from "expo-sqlite";

import type { Drawing, Sketchpad, StoreData } from "@/store/migrate";
import { activeLocalOwnerId } from "./account-repository";
import {
  loadLibrary,
  saveLibrary,
  type LibraryWriteAccess,
} from "./library-repository";
import { enqueueCurrentChildProfile } from "./sync-serialization";

export interface ImportedArchiveChildRecord {
  id: string;
  name: string;
  avatarColor: string;
  birthMonth: number | null;
  birthYear: number | null;
  createdAt: number;
}

export interface ImportedArchiveLibrary {
  children: ImportedArchiveChildRecord[];
  pads: Sketchpad[];
  drawingsByPad: Record<string, Drawing[]>;
  mediaChecksums: Record<string, { cutout: string; original?: string }>;
}

export interface ArchiveImportAccess extends LibraryWriteAccess {
  assertWriteAllowed: () => void;
}

interface ImportedArchiveIds {
  childIds: string[];
  padIds: string[];
  artworkIds: string[];
}

function uniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id.trim() || id !== id.trim() || id.length > 200) {
      throw new Error(`The imported ${label} ID is invalid.`);
    }
    if (seen.has(id)) throw new Error(`The imported library contains a duplicate ${label} ID.`);
    seen.add(id);
  }
}

export function validateImportedArchiveLibrary(
  imported: ImportedArchiveLibrary,
): ImportedArchiveIds {
  const childIds = imported.children.map((child) => child.id);
  const padIds = imported.pads.map((pad) => pad.id);
  const artworkIds = Object.values(imported.drawingsByPad)
    .flat()
    .map((drawing) => drawing.id);
  uniqueIds(childIds, "child");
  uniqueIds(padIds, "sketchpad");
  uniqueIds(artworkIds, "artwork");

  const childIdSet = new Set(childIds);
  const padIdSet = new Set(padIds);
  const childIdsWithPads = new Set(imported.pads.map((pad) => pad.childId));
  for (const pad of imported.pads) {
    if (!childIdSet.has(pad.childId)) {
      throw new Error(`Imported sketchpad ${pad.id} does not belong to an imported child.`);
    }
    if (!Object.hasOwn(imported.drawingsByPad, pad.id)) {
      throw new Error(`Imported sketchpad ${pad.id} is missing its artwork list.`);
    }
  }
  for (const childId of childIds) {
    if (!childIdsWithPads.has(childId)) {
      throw new Error(`Imported child ${childId} has no sketchpad.`);
    }
  }
  for (const padId of Object.keys(imported.drawingsByPad)) {
    if (!padIdSet.has(padId)) {
      throw new Error(`Imported artwork references unknown sketchpad ${padId}.`);
    }
  }

  const artworkIdSet = new Set(artworkIds);
  const checksumSet = new Set<string>();
  for (const artworkId of artworkIds) {
    const checksums = imported.mediaChecksums[artworkId];
    if (!checksums || !/^[0-9a-f]{64}$/.test(checksums.cutout)) {
      throw new Error(`Imported artwork ${artworkId} is missing a valid cutout checksum.`);
    }
    if (checksums.original && !/^[0-9a-f]{64}$/.test(checksums.original)) {
      throw new Error(`Imported artwork ${artworkId} has an invalid original checksum.`);
    }
    if (checksumSet.has(checksums.cutout)) {
      throw new Error("The imported library contains duplicate artwork content.");
    }
    checksumSet.add(checksums.cutout);
  }
  for (const artworkId of Object.keys(imported.mediaChecksums)) {
    if (!artworkIdSet.has(artworkId)) {
      throw new Error(`Imported checksum references unknown artwork ${artworkId}.`);
    }
  }

  return { childIds, padIds, artworkIds };
}

async function assertNoImportedIdCollisions(
  db: SQLiteDatabase,
  ids: ImportedArchiveIds,
): Promise<void> {
  for (const [table, entityIds] of [
    ["child_profiles", ids.childIds],
    ["sketchpads", ids.padIds],
    ["artworks", ids.artworkIds],
  ] as const) {
    if (entityIds.length === 0) continue;
    const placeholders = entityIds.map(() => "?").join(",");
    const existing = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM ${table} WHERE id IN (${placeholders})`,
      ...entityIds,
    );
    if (existing.length > 0) {
      throw new Error("The imported library conflicts with existing local record IDs.");
    }
  }
}

async function assertActiveOwner(db: SQLiteDatabase, ownerId: string): Promise<void> {
  if (await activeLocalOwnerId(db) !== ownerId) {
    throw new Error("The active Buki account changed during the import.");
  }
}

export async function mergeImportedArchive(
  db: SQLiteDatabase,
  imported: ImportedArchiveLibrary,
  access: ArchiveImportAccess,
): Promise<StoreData> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("Sign in before importing a Buki archive.");
  if (imported.children.length === 0) return loadLibrary(db);

  const importedIds = validateImportedArchiveLibrary(imported);
  await assertNoImportedIdCollisions(db, importedIds);

  const current = await loadLibrary(db);
  await assertActiveOwner(db, ownerId);
  const now = Date.now();
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM child_profiles WHERE owner_id = ? AND deleted_at IS NULL",
    ownerId,
  );

  const next: StoreData = {
    version: 5,
    activePadId: current.activePadId,
    pads: [...current.pads, ...imported.pads],
    drawingsByPad: { ...current.drawingsByPad, ...imported.drawingsByPad },
  };
  let childProfilesCommitted = false;

  try {
    access.assertWriteAllowed();
    await db.withExclusiveTransactionAsync(async (tx) => {
      access.assertWriteAllowed();
      for (const [index, child] of imported.children.entries()) {
        await tx.runAsync(
          `INSERT INTO child_profiles (
            id, owner_id, name, avatar_color, avatar_uri, birth_month, birth_year,
            sort_order, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)`,
          child.id,
          ownerId,
          child.name,
          child.avatarColor,
          child.birthMonth,
          child.birthYear,
          (count?.count ?? 0) + index,
          child.createdAt,
          now,
        );
        await enqueueCurrentChildProfile(tx, ownerId, child.id);
      }
      access.assertWriteAllowed();
    });
    childProfilesCommitted = true;
    access.assertWriteAllowed();
    await assertActiveOwner(db, ownerId);
    await saveLibrary(db, next, access, {
      mediaChecksums: imported.mediaChecksums,
      expectedOwnerId: ownerId,
    });
    return next;
  } catch (error) {
    if (childProfilesCommitted) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        if (importedIds.childIds.length > 0) {
          const placeholders = importedIds.childIds.map(() => "?").join(",");
          await tx.runAsync(
            `DELETE FROM sync_queue
             WHERE owner_id = ? AND entity_type = 'child_profile' AND entity_id IN (${placeholders})`,
            ownerId,
            ...importedIds.childIds,
          );
        }
        for (const child of imported.children) {
          await tx.runAsync("DELETE FROM child_profiles WHERE id = ? AND owner_id = ?", child.id, ownerId);
        }
      });
    }
    throw error;
  }
}
