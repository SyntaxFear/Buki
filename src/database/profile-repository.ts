import type { SQLiteDatabase } from "expo-sqlite";

import { getPadDesign } from "@/pad-designs";
import { activeLocalOwnerId, activePadPreferenceKey } from "./account-repository";
import {
  enqueueCurrentAdultProfile,
  enqueueCurrentChildProfile,
  enqueueCurrentSketchpad,
  enqueueEntityDeletion,
} from "./sync-serialization";

export interface LocalChildProfile {
  id: string;
  ownerId: string;
  name: string;
  avatarColor: string;
  avatarUri: string | null;
  birthMonth: number | null;
  birthYear: number | null;
  sortOrder: number;
  createdAt: number;
}

export interface ProfileStateRecord {
  ownerId: string | null;
  children: LocalChildProfile[];
  activeChildId: string | null;
  onboardingComplete: boolean;
}

function scopedKey(name: string, ownerId: string): string {
  return `${name}:${ownerId}`;
}

export async function loadProfileState(db: SQLiteDatabase): Promise<ProfileStateRecord> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) return { ownerId: null, children: [], activeChildId: null, onboardingComplete: false };
  const rows = await db.getAllAsync<{
    id: string;
    owner_id: string;
    name: string;
    avatar_color: string;
    avatar_uri: string | null;
    birth_month: number | null;
    birth_year: number | null;
    sort_order: number;
    created_at: number;
  }>(
    `SELECT id, owner_id, name, avatar_color, avatar_uri, birth_month, birth_year, sort_order, created_at
     FROM child_profiles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at`,
    ownerId,
  );
  const activeChild = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    scopedKey("active_child_id", ownerId),
  );
  const onboarding = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    scopedKey("onboarding_complete", ownerId),
  );
  return {
    ownerId,
    children: rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      avatarColor: row.avatar_color,
      avatarUri: row.avatar_uri,
      birthMonth: row.birth_month,
      birthYear: row.birth_year,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    })),
    activeChildId: rows.some((row) => row.id === activeChild?.value)
      ? (activeChild?.value ?? null)
      : (rows[0]?.id ?? null),
    onboardingComplete: onboarding?.value === "true",
  };
}

export async function completeLocalOnboarding(
  db: SQLiteDatabase,
  input: {
    adultName: string;
    adultAvatarUri: string | null;
    childId: string;
    childName: string;
    childAvatarColor: string;
    defaultPadId: string;
  },
): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("Sign in before completing onboarding.");
  const now = Date.now();
  const design = getPadDesign("sunshine");

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE adult_profiles SET display_name = ?, avatar_uri = ?, updated_at = ? WHERE id = ?`,
      input.adultName,
      input.adultAvatarUri,
      now,
      ownerId,
    );
    const firstChild = await tx.getFirstAsync<{ id: string }>(
      "SELECT id FROM child_profiles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at LIMIT 1",
      ownerId,
    );
    const childId = firstChild?.id ?? input.childId;
    if (firstChild) {
      await tx.runAsync(
        `UPDATE child_profiles
         SET name = ?, avatar_color = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ? AND owner_id = ?`,
        input.childName,
        input.childAvatarColor,
        now,
        childId,
        ownerId,
      );
    } else {
      await tx.runAsync(
        `INSERT INTO child_profiles (
          id, owner_id, name, avatar_color, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
        childId,
        ownerId,
        input.childName,
        input.childAvatarColor,
        now,
        now,
      );
    }

    await tx.runAsync(
      `UPDATE sketchpads SET child_id = ?, updated_at = ? WHERE owner_id = ?`,
      childId,
      now,
      ownerId,
    );
    const firstPad = await tx.getFirstAsync<{ id: string }>(
      "SELECT id FROM sketchpads WHERE owner_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at LIMIT 1",
      ownerId,
    );
    const activePadId = firstPad?.id ?? input.defaultPadId;
    if (!firstPad) {
      await tx.runAsync(
        `INSERT INTO sketchpads (
          id, owner_id, child_id, name, style, design, cover_color, page_color,
          sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, 'My Book', 'spread', 'sunshine', ?, ?, 0, ?, ?, NULL)`,
        activePadId,
        ownerId,
        childId,
        design.cover,
        design.paper,
        now,
        now,
      );
    }

    for (const [key, value] of [
      [scopedKey("active_child_id", ownerId), childId],
      [scopedKey("onboarding_complete", ownerId), "true"],
      [activePadPreferenceKey(ownerId), activePadId],
    ] as const) {
      await tx.runAsync(
        `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        value,
        now,
      );
    }
    await enqueueCurrentAdultProfile(tx, ownerId);
    await enqueueCurrentChildProfile(tx, ownerId, childId);
    await enqueueCurrentSketchpad(tx, ownerId, activePadId);
  });
}

export async function createLocalChild(
  db: SQLiteDatabase,
  child: Omit<LocalChildProfile, "ownerId" | "sortOrder" | "createdAt">,
  defaultPadId: string,
): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("Sign in before creating a child profile.");
  const now = Date.now();
  const design = getPadDesign("sunshine");
  await db.withExclusiveTransactionAsync(async (tx) => {
    const count = await tx.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM child_profiles WHERE owner_id = ? AND deleted_at IS NULL",
      ownerId,
    );
    await tx.runAsync(
      `INSERT INTO child_profiles (
        id, owner_id, name, avatar_color, avatar_uri, birth_month, birth_year,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      child.id,
      ownerId,
      child.name,
      child.avatarColor,
      child.avatarUri,
      child.birthMonth,
      child.birthYear,
      count?.count ?? 0,
      now,
      now,
    );
    await tx.runAsync(
      `INSERT INTO sketchpads (
        id, owner_id, child_id, name, style, design, cover_color, page_color,
        sort_order, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'My Book', 'spread', 'sunshine', ?, ?, 0, ?, ?, NULL)`,
      defaultPadId,
      ownerId,
      child.id,
      design.cover,
      design.paper,
      now,
      now,
    );
    await enqueueCurrentChildProfile(tx, ownerId, child.id);
    await enqueueCurrentSketchpad(tx, ownerId, defaultPadId);
  });
}

export async function updateLocalChild(
  db: SQLiteDatabase,
  childId: string,
  updates: Partial<Pick<LocalChildProfile, "name" | "avatarColor" | "avatarUri" | "birthMonth" | "birthYear">>,
): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("No active Buki account.");
  const current = await db.getFirstAsync<LocalChildProfile & {
    avatar_color: string;
    avatar_uri: string | null;
    birth_month: number | null;
    birth_year: number | null;
  }>(
    `SELECT name, avatar_color, avatar_uri, birth_month, birth_year
     FROM child_profiles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    childId,
    ownerId,
  );
  if (!current) throw new Error("Child profile not found.");
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE child_profiles SET
        name = ?, avatar_color = ?, avatar_uri = ?, birth_month = ?, birth_year = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`,
      updates.name ?? current.name,
      updates.avatarColor ?? current.avatar_color,
      updates.avatarUri === undefined ? current.avatar_uri : updates.avatarUri,
      updates.birthMonth === undefined ? current.birth_month : updates.birthMonth,
      updates.birthYear === undefined ? current.birth_year : updates.birthYear,
      Date.now(),
      childId,
      ownerId,
    );
    await enqueueCurrentChildProfile(tx, ownerId, childId);
  });
}

export async function setActiveLocalChild(db: SQLiteDatabase, childId: string): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("No active Buki account.");
  await db.runAsync(
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    scopedKey("active_child_id", ownerId),
    childId,
    Date.now(),
  );
}

export async function reorderLocalChildren(db: SQLiteDatabase, orderedIds: string[]): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("No active Buki account.");
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const [index, childId] of orderedIds.entries()) {
      await tx.runAsync(
        "UPDATE child_profiles SET sort_order = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
        index,
        now,
        childId,
        ownerId,
      );
      await enqueueCurrentChildProfile(tx, ownerId, childId);
    }
  });
}

export async function deleteLocalChild(db: SQLiteDatabase, childId: string): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("No active Buki account.");
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM child_profiles WHERE owner_id = ? AND deleted_at IS NULL",
    ownerId,
  );
  if ((count?.count ?? 0) <= 1) throw new Error("Buki must keep at least one child profile.");
  await db.withExclusiveTransactionAsync(async (tx) => {
    const mediaFiles = await tx.getAllAsync<{ id: string }>(
      `SELECT media_files.id
       FROM media_files
       JOIN artworks ON artworks.id = media_files.artwork_id
       WHERE media_files.owner_id = ? AND artworks.owner_id = ? AND artworks.child_id = ?`,
      ownerId,
      ownerId,
      childId,
    );
    for (const media of mediaFiles) {
      await enqueueEntityDeletion(tx, ownerId, "media_file", media.id);
    }
    await enqueueEntityDeletion(tx, ownerId, "child_profile", childId);
    await tx.runAsync("DELETE FROM child_profiles WHERE id = ? AND owner_id = ?", childId, ownerId);
    const next = await tx.getFirstAsync<{ id: string }>(
      `SELECT id FROM child_profiles
       WHERE owner_id = ? AND deleted_at IS NULL
       ORDER BY sort_order, created_at LIMIT 1`,
      ownerId,
    );
    if (next) {
      await tx.runAsync(
        `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        scopedKey("active_child_id", ownerId),
        next.id,
        Date.now(),
      );
    }
  });
}

export async function replayLocalOnboarding(db: SQLiteDatabase): Promise<void> {
  const ownerId = await activeLocalOwnerId(db);
  if (!ownerId) throw new Error("No active Buki account.");
  await db.runAsync("DELETE FROM preferences WHERE key = ?", scopedKey("onboarding_complete", ownerId));
}
