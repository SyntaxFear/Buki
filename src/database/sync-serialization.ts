import type { SQLiteDatabase } from "expo-sqlite";

import type { SyncEntityType } from "@/sync/types";
import { enqueueLocalSyncOperation } from "./sync-repository";

function iso(value: number): string {
  return new Date(value).toISOString();
}

export function artworkTagEntityId(artworkId: string, tagId: string): string {
  return `${encodeURIComponent(artworkId)}|${encodeURIComponent(tagId)}`;
}

export async function enqueueCurrentAdultProfile(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    display_name: string;
    email: string | null;
    avatar_uri: string | null;
    created_at: number;
    updated_at: number;
  }>(
    "SELECT id, display_name, email, avatar_uri, created_at, updated_at FROM adult_profiles WHERE id = ?",
    ownerId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "adult_profile",
    entityId: row.id,
    payload: {
      owner_id: row.id,
      display_name: row.display_name,
      email: row.email,
      avatar_url: row.avatar_uri,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    },
  });
}

export async function enqueueCurrentChildProfile(
  db: SQLiteDatabase,
  ownerId: string,
  childId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    avatar_color: string;
    avatar_uri: string | null;
    birth_month: number | null;
    birth_year: number | null;
    sort_order: number;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT id, name, avatar_color, avatar_uri, birth_month, birth_year,
            sort_order, created_at, updated_at
     FROM child_profiles WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`,
    ownerId,
    childId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "child_profile",
    entityId: row.id,
    payload: {
      owner_id: ownerId,
      id: row.id,
      name: row.name,
      avatar_color: row.avatar_color,
      avatar_url: row.avatar_uri,
      birth_month: row.birth_month,
      birth_year: row.birth_year,
      sort_order: row.sort_order,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      deleted_at: null,
    },
  });
}

export async function enqueueCurrentSketchpad(
  db: SQLiteDatabase,
  ownerId: string,
  sketchpadId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    child_id: string;
    name: string;
    style: string;
    design: string;
    border: string;
    decoration: string;
    icon: string;
    cover_color: string;
    page_color: string | null;
    sort_order: number;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT id, child_id, name, style, design, border, decoration, icon, cover_color,
            page_color, sort_order, created_at, updated_at
     FROM sketchpads WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`,
    ownerId,
    sketchpadId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "sketchpad",
    entityId: row.id,
    payload: {
      owner_id: ownerId,
      id: row.id,
      child_id: row.child_id,
      name: row.name,
      style: row.style,
      design: row.design,
      border: row.border,
      decoration: row.decoration,
      icon: row.icon,
      cover_color: row.cover_color,
      page_color: row.page_color,
      sort_order: row.sort_order,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      deleted_at: null,
    },
  });
}

export async function enqueueCurrentArtwork(
  db: SQLiteDatabase,
  ownerId: string,
  artworkId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    child_id: string;
    sketchpad_id: string;
    width: number;
    height: number;
    rotation: number;
    title: string | null;
    notes: string | null;
    favorite: number;
    added_at: number;
    updated_at: number;
  }>(
    `SELECT id, child_id, sketchpad_id, width, height, rotation, title, notes,
            favorite, added_at, updated_at
     FROM artworks WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`,
    ownerId,
    artworkId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "artwork",
    entityId: row.id,
    payload: {
      owner_id: ownerId,
      id: row.id,
      child_id: row.child_id,
      sketchpad_id: row.sketchpad_id,
      width: row.width,
      height: row.height,
      rotation: row.rotation,
      title: row.title,
      notes: row.notes,
      favorite: row.favorite === 1,
      added_at: iso(row.added_at),
      updated_at: iso(row.updated_at),
      deleted_at: null,
    },
  });
}

export async function enqueueCurrentMediaFile(
  db: SQLiteDatabase,
  ownerId: string,
  mediaId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    artwork_id: string;
    kind: string;
    checksum: string | null;
    byte_size: number | null;
    mime_type: string | null;
    updated_at: number;
  }>(
    `SELECT media_files.id, media_files.artwork_id, media_files.kind,
            media_files.checksum, media_files.byte_size, media_files.mime_type,
            media_files.updated_at
     FROM media_files
     JOIN artworks ON artworks.id = media_files.artwork_id
     WHERE media_files.owner_id = ? AND media_files.id = ?
       AND artworks.owner_id = ? AND artworks.deleted_at IS NULL`,
    ownerId,
    mediaId,
    ownerId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "media_file",
    entityId: row.id,
    payload: {
      owner_id: ownerId,
      id: row.id,
      artwork_id: row.artwork_id,
      kind: row.kind,
      checksum: row.checksum,
      byte_size: row.byte_size,
      mime_type: row.mime_type,
      updated_at: iso(row.updated_at),
    },
  });
}

export async function enqueueCurrentTag(
  db: SQLiteDatabase,
  ownerId: string,
  tagId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    normalized_name: string;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT id, name, normalized_name, created_at, updated_at
     FROM tags WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`,
    ownerId,
    tagId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "tag",
    entityId: row.id,
    payload: {
      owner_id: ownerId,
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      deleted_at: null,
    },
  });
}

export async function enqueueCurrentArtworkTag(
  db: SQLiteDatabase,
  ownerId: string,
  artworkId: string,
  tagId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ created_at: number }>(
    `SELECT artwork_tags.created_at
     FROM artwork_tags
     JOIN artworks ON artworks.id = artwork_tags.artwork_id
     JOIN tags ON tags.id = artwork_tags.tag_id
     WHERE artwork_tags.artwork_id = ? AND artwork_tags.tag_id = ?
       AND artworks.owner_id = ? AND tags.owner_id = ?`,
    artworkId,
    tagId,
    ownerId,
    ownerId,
  );
  if (!row) return;
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "upsert",
    entityType: "artwork_tag",
    entityId: artworkTagEntityId(artworkId, tagId),
    payload: {
      owner_id: ownerId,
      artwork_id: artworkId,
      tag_id: tagId,
      created_at: iso(row.created_at),
    },
  });
}

export async function enqueueEntityDeletion(
  db: SQLiteDatabase,
  ownerId: string,
  entityType: SyncEntityType,
  entityId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const now = Date.now();
  await enqueueLocalSyncOperation(db, {
    ownerId,
    operation: "delete",
    entityType,
    entityId,
    payload: { owner_id: ownerId, ...payload, deleted_at: new Date(now).toISOString() },
    now,
  });
}

export async function enqueueFullAccountSnapshot(
  db: SQLiteDatabase,
  ownerId: string,
): Promise<void> {
  await enqueueCurrentAdultProfile(db, ownerId);
  const children = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM child_profiles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at",
    ownerId,
  );
  for (const child of children) await enqueueCurrentChildProfile(db, ownerId, child.id);
  const pads = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM sketchpads WHERE owner_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at",
    ownerId,
  );
  for (const pad of pads) await enqueueCurrentSketchpad(db, ownerId, pad.id);
  const artworks = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM artworks WHERE owner_id = ? AND deleted_at IS NULL ORDER BY added_at",
    ownerId,
  );
  for (const artwork of artworks) await enqueueCurrentArtwork(db, ownerId, artwork.id);
  const mediaFiles = await db.getAllAsync<{ id: string }>(
    `SELECT media_files.id
     FROM media_files
     JOIN artworks ON artworks.id = media_files.artwork_id
     WHERE media_files.owner_id = ? AND artworks.owner_id = ? AND artworks.deleted_at IS NULL
     ORDER BY media_files.created_at`,
    ownerId,
    ownerId,
  );
  for (const media of mediaFiles) await enqueueCurrentMediaFile(db, ownerId, media.id);
  const tags = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM tags WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at",
    ownerId,
  );
  for (const tag of tags) await enqueueCurrentTag(db, ownerId, tag.id);
  const relations = await db.getAllAsync<{ artwork_id: string; tag_id: string }>(
    `SELECT artwork_tags.artwork_id, artwork_tags.tag_id
     FROM artwork_tags
     JOIN artworks ON artworks.id = artwork_tags.artwork_id
     JOIN tags ON tags.id = artwork_tags.tag_id
     WHERE artworks.owner_id = ? AND tags.owner_id = ?
     ORDER BY artwork_tags.created_at`,
    ownerId,
    ownerId,
  );
  for (const relation of relations) {
    await enqueueCurrentArtworkTag(db, ownerId, relation.artwork_id, relation.tag_id);
  }
}
