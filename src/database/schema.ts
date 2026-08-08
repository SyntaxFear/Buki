import type { SQLiteDatabase } from "expo-sqlite";

import { DATABASE_VERSION } from "./constants";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS adult_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_uri TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS child_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  avatar_uri TEXT,
  birth_month INTEGER,
  birth_year INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS sketchpads (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  child_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  style TEXT NOT NULL,
  design TEXT NOT NULL,
  cover_color TEXT NOT NULL,
  page_color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS sketchpads_child_idx ON sketchpads(child_id, sort_order);

CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  child_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  sketchpad_id TEXT NOT NULL REFERENCES sketchpads(id) ON DELETE CASCADE,
  cutout_uri TEXT NOT NULL,
  photo_uri TEXT,
  preview_uri TEXT,
  width REAL NOT NULL,
  height REAL NOT NULL,
  rotation REAL NOT NULL,
  title TEXT,
  notes TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  media_missing INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS artworks_sketchpad_idx ON artworks(sketchpad_id, added_at);
CREATE INDEX IF NOT EXISTS artworks_child_idx ON artworks(child_id, added_at);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_owner_name_idx ON tags(owner_id, normalized_name);

CREATE TABLE IF NOT EXISTS artwork_tags (
  artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (artwork_id, tag_id)
);

CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  local_uri TEXT,
  remote_path TEXT,
  checksum TEXT,
  byte_size INTEGER,
  mime_type TEXT,
  upload_state TEXT NOT NULL DEFAULT 'local',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS media_checksum_idx ON media_files(owner_id, checksum, kind);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS sync_queue_ready_idx ON sync_queue(available_at, created_at);

CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  synced_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS tombstones_entity_idx ON tombstones(owner_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS entitlement_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT,
  tier TEXT NOT NULL,
  product TEXT,
  status TEXT NOT NULL,
  expires_at TEXT,
  will_renew INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_usage (
  owner_id TEXT PRIMARY KEY NOT NULL,
  bytes_used INTEGER NOT NULL DEFAULT 0,
  bytes_limit INTEGER NOT NULL DEFAULT 2147483648,
  measured_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const SCHEMA_V2 = `
ALTER TABLE sketchpads ADD COLUMN border TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sketchpads ADD COLUMN decoration TEXT NOT NULL DEFAULT 'none';
`;

export async function migrateDatabaseSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const current = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = current?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(SCHEMA_V1);
      await tx.execAsync("PRAGMA user_version = 1");
    });
  }

  if (currentVersion < 2) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(SCHEMA_V2);
      await tx.execAsync("PRAGMA user_version = 2");
    });
  }

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(`Buki database version ${currentVersion} is newer than supported ${DATABASE_VERSION}`);
  }
}
