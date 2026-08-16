import type { SQLiteDatabase } from "expo-sqlite";
import type { User } from "@supabase/supabase-js";

import { enqueueCurrentAdultProfile, enqueueFullAccountSnapshot } from "./sync-serialization";

export const ACTIVE_OWNER_KEY = "active_owner_id";

export interface LocalAdultProfile {
  id: string;
  displayName: string;
  email: string | null;
  avatarUri: string | null;
}

export function activePadPreferenceKey(ownerId: string | null): string {
  return `active_pad_id:${ownerId ?? "local"}`;
}

const VIEWED_UNIT_PREFIX = "viewed_unit:";

export function viewedUnitPreferenceKey(
  ownerId: string | null,
  padId: string,
): string {
  return `${VIEWED_UNIT_PREFIX}${encodeURIComponent(padId)}:${ownerId ?? "local"}`;
}

export function padIdFromViewedUnitPreferenceKey(
  key: string,
  ownerId: string | null,
): string | null {
  const suffix = `:${ownerId ?? "local"}`;
  if (!key.startsWith(VIEWED_UNIT_PREFIX) || !key.endsWith(suffix)) return null;
  const encodedPadId = key.slice(VIEWED_UNIT_PREFIX.length, -suffix.length);
  if (!encodedPadId) return null;
  try {
    return decodeURIComponent(encodedPadId);
  } catch {
    return null;
  }
}

function displayNameFor(user: User): string {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] || "Buki Parent";
}

export async function activateLocalAccount(db: SQLiteDatabase, user: User): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const legacyActivePad = await tx.getFirstAsync<{ value: string }>(
      "SELECT value FROM preferences WHERE key IN ('active_pad_id', 'active_pad_id:local') ORDER BY key DESC LIMIT 1",
    );
    const localViewedUnits = await tx.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM preferences WHERE key LIKE 'viewed_unit:%:local'",
    );
    await tx.runAsync(
      `INSERT INTO adult_profiles (id, display_name, email, avatar_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         email = excluded.email,
         avatar_uri = COALESCE(excluded.avatar_uri, adult_profiles.avatar_uri),
         updated_at = excluded.updated_at`,
      user.id,
      displayNameFor(user),
      user.email ?? null,
      typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
      now,
      now,
    );

    for (const table of [
      "child_profiles",
      "sketchpads",
      "artworks",
      "tags",
      "media_files",
      "sync_queue",
      "tombstones",
    ]) {
      await tx.runAsync(`UPDATE ${table} SET owner_id = ? WHERE owner_id IS NULL`, user.id);
    }

    await tx.runAsync(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ACTIVE_OWNER_KEY,
      user.id,
      now,
    );
    if (legacyActivePad?.value) {
      await tx.runAsync(
        `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        activePadPreferenceKey(user.id),
        legacyActivePad.value,
        now,
      );
    }
    for (const viewedUnit of localViewedUnits) {
      const padId = padIdFromViewedUnitPreferenceKey(viewedUnit.key, null);
      if (!padId) continue;
      await tx.runAsync(
        `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        viewedUnitPreferenceKey(user.id, padId),
        viewedUnit.value,
        now,
      );
    }
    await enqueueFullAccountSnapshot(tx, user.id);
  });
}

export async function clearActiveLocalAccount(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM preferences WHERE key = ?", ACTIVE_OWNER_KEY);
}

export async function activeLocalOwnerId(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    ACTIVE_OWNER_KEY,
  );
  return row?.value ?? null;
}

export async function getLocalAdultProfile(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<LocalAdultProfile | null> {
  const row = await db.getFirstAsync<{
    id: string;
    display_name: string;
    email: string | null;
    avatar_uri: string | null;
  }>(
    "SELECT id, display_name, email, avatar_uri FROM adult_profiles WHERE id = ?",
    ownerId,
  );
  return row
    ? { id: row.id, displayName: row.display_name, email: row.email, avatarUri: row.avatar_uri }
    : null;
}

export async function getActiveLocalAdultProfile(
  db: SQLiteDatabase,
): Promise<LocalAdultProfile | null> {
  const ownerId = await activeLocalOwnerId(db);
  return ownerId ? getLocalAdultProfile(db, ownerId) : null;
}

export async function updateLocalAdultProfile(
  db: SQLiteDatabase,
  ownerId: string,
  updates: { displayName: string; avatarUri: string | null },
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE adult_profiles
       SET display_name = ?, avatar_uri = ?, updated_at = ?
       WHERE id = ?`,
      updates.displayName,
      updates.avatarUri,
      Date.now(),
      ownerId,
    );
    await enqueueCurrentAdultProfile(tx, ownerId);
  });
}
