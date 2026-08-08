import type { SQLiteDatabase } from "expo-sqlite";

import type { Drawing, Sketchpad, StoreData } from "@/store/migrate";
import { activeLocalOwnerId } from "./account-repository";
import {
  loadLibrary,
  saveLibrary,
  type LibraryWriteAccess,
} from "./library-repository";

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

export async function mergeImportedArchive(
  db: SQLiteDatabase,
  imported: ImportedArchiveLibrary,
  access: ArchiveImportAccess,
): Promise<StoreData> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("Sign in before importing a Buki archive.");
  if (imported.children.length === 0) return loadLibrary(db);

  const current = await loadLibrary(db);
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
      }
      access.assertWriteAllowed();
    });
    access.assertWriteAllowed();
    await saveLibrary(db, next, access);
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const [artworkId, checksums] of Object.entries(imported.mediaChecksums)) {
        await tx.runAsync(
          "UPDATE OR IGNORE media_files SET checksum = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
          checksums.cutout,
          now,
          `${artworkId}:cutout`,
          ownerId,
        );
        if (checksums.original) {
          await tx.runAsync(
            "UPDATE OR IGNORE media_files SET checksum = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
            checksums.original,
            now,
            `${artworkId}:original`,
            ownerId,
          );
        }
      }
    });
    return next;
  } catch (error) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const child of imported.children) {
        await tx.runAsync("DELETE FROM child_profiles WHERE id = ? AND owner_id = ?", child.id, ownerId);
      }
    });
    throw error;
  }
}
