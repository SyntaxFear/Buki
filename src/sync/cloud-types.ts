export interface RemoteAdultProfile {
  owner_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteChildProfile {
  owner_id: string;
  id: string;
  name: string;
  avatar_color: string;
  avatar_url: string | null;
  birth_month: number | null;
  birth_year: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
  deleted_at: string | null;
}

export interface RemoteSketchpad {
  owner_id: string;
  id: string;
  child_id: string;
  name: string;
  style: string;
  design: string;
  border: string;
  decoration: string;
  cover_color: string;
  page_color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
  deleted_at: string | null;
}

export interface RemoteArtwork {
  owner_id: string;
  id: string;
  child_id: string;
  sketchpad_id: string;
  width: number;
  height: number;
  rotation: number;
  title: string | null;
  notes: string | null;
  favorite: boolean;
  added_at: string;
  updated_at: string;
  server_updated_at: string;
  deleted_at: string | null;
}

export interface RemoteTag {
  owner_id: string;
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
  deleted_at: string | null;
}

export interface RemoteArtworkTag {
  owner_id: string;
  artwork_id: string;
  tag_id: string;
  created_at: string;
  server_updated_at: string;
}

export type RemoteMediaKind = "cutout" | "preview" | "original";

export interface RemoteMediaFile {
  owner_id: string;
  id: string;
  artwork_id: string;
  kind: RemoteMediaKind;
  storage_path: string;
  checksum: string;
  byte_size: number;
  mime_type: string;
  upload_state: string;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
  deleted_at: string | null;
}

export interface DownloadedRemoteMedia extends RemoteMediaFile {
  local_uri: string;
}

export interface RemoteTombstone {
  owner_id: string;
  entity_type: "child_profile" | "sketchpad" | "artwork" | "tag" | "media_file";
  entity_id: string;
  deleted_at: string;
  server_updated_at: string;
}

export interface RemoteCloudSnapshot {
  adult: RemoteAdultProfile | null;
  children: RemoteChildProfile[];
  sketchpads: RemoteSketchpad[];
  artworks: RemoteArtwork[];
  tags: RemoteTag[];
  artworkTags: RemoteArtworkTag[];
  mediaFiles: DownloadedRemoteMedia[];
  tombstones: RemoteTombstone[];
  cloudBytes: number;
  cloudLimit: number;
  failedMediaCount: number;
}

export interface CloudRestoreResult {
  children: number;
  sketchpads: number;
  artworks: number;
  mediaFiles: number;
  failedMediaCount: number;
  restoredAt: string;
}
