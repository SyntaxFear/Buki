import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { getSupabaseClient } from "@/auth/supabase";
import { restoreBukiCloudSnapshot } from "@/database";
import type {
  CloudRestoreResult,
  DownloadedRemoteMedia,
  RemoteAdultProfile,
  RemoteArtwork,
  RemoteArtworkTag,
  RemoteChildProfile,
  RemoteCloudSnapshot,
  RemoteMediaFile,
  RemoteSketchpad,
  RemoteTag,
  RemoteTombstone,
} from "./cloud-types";

const PAGE_SIZE = 500;
const MEDIA_BUCKET = "buki-media";

class CloudRestoreError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "CloudRestoreError";
  }
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function checksum(buffer: ArrayBuffer): Promise<string> {
  return hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buffer));
}

async function fetchRows<T>(table: string, ownerId: string): Promise<T[]> {
  const rows: T[] = [];
  const orderColumns = table === "artwork_tags"
    ? ["artwork_id", "tag_id"]
    : table === "tombstones"
      ? ["entity_type", "entity_id"]
      : ["id"];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = getSupabaseClient()
      .from(table)
      .select("*")
      .eq("owner_id", ownerId);
    for (const column of orderColumns) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new CloudRestoreError(`Buki could not load ${table}.`, error.code);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function cloudMediaDirectory(ownerId: string): Directory {
  const directory = new Directory(Paths.document, "Buki", "Cloud", ownerId);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

async function validExistingFile(file: File, expectedChecksum: string): Promise<boolean> {
  if (!file.exists) return false;
  try {
    return await checksum(await file.arrayBuffer()) === expectedChecksum;
  } catch {
    return false;
  }
}

async function downloadMedia(
  ownerId: string,
  media: RemoteMediaFile,
  directory: Directory,
): Promise<DownloadedRemoteMedia> {
  if (
    media.owner_id !== ownerId
    || !media.storage_path.startsWith(`${ownerId}/`)
    || !/^[0-9a-f]{64}$/.test(media.checksum)
  ) {
    throw new CloudRestoreError("Cloud media metadata did not belong to this account.", "invalid_media_metadata");
  }
  const file = new File(directory, `${media.checksum}-${media.kind}.${extensionFor(media.mime_type)}`);
  if (!(await validExistingFile(file, media.checksum))) {
    const { data, error } = await getSupabaseClient().storage.from(MEDIA_BUCKET).download(media.storage_path);
    if (error || !data) throw new CloudRestoreError("Buki could not download an artwork image.", "media_download_failed");
    const bytes = await data.arrayBuffer();
    if (bytes.byteLength !== media.byte_size || await checksum(bytes) !== media.checksum) {
      throw new CloudRestoreError("A cloud artwork image failed integrity verification.", "media_integrity_failed");
    }
    file.create({ intermediates: true, overwrite: true });
    file.write(new Uint8Array(bytes));
  }
  return { ...media, local_uri: file.uri };
}

async function fetchRemoteSnapshot(ownerId: string): Promise<RemoteCloudSnapshot> {
  const client = getSupabaseClient();
  const [
    adultResult,
    children,
    sketchpads,
    artworks,
    tags,
    artworkTags,
    mediaRows,
    tombstones,
    usageResult,
  ] = await Promise.all([
    client.from("adult_profiles").select("*").eq("owner_id", ownerId).maybeSingle(),
    fetchRows<RemoteChildProfile>("child_profiles", ownerId),
    fetchRows<RemoteSketchpad>("sketchpads", ownerId),
    fetchRows<RemoteArtwork>("artworks", ownerId),
    fetchRows<RemoteTag>("tags", ownerId),
    fetchRows<RemoteArtworkTag>("artwork_tags", ownerId),
    fetchRows<RemoteMediaFile>("media_files", ownerId),
    fetchRows<RemoteTombstone>("tombstones", ownerId),
    client.from("storage_usage").select("bytes_used,bytes_limit").eq("owner_id", ownerId).maybeSingle(),
  ]);
  if (adultResult.error) throw new CloudRestoreError("Buki could not load the adult profile.", adultResult.error.code);
  if (usageResult.error) throw new CloudRestoreError("Buki could not load cloud storage usage.", usageResult.error.code);

  const directory = cloudMediaDirectory(ownerId);
  const downloaded: DownloadedRemoteMedia[] = [];
  let failedMediaCount = 0;
  const activeMedia = mediaRows.filter(
    (media) => !media.deleted_at && media.upload_state === "uploaded",
  );
  const restoredByFile = new Map<string, string>();
  for (const media of activeMedia) {
    const fileKey = `${media.checksum}:${media.kind}:${media.mime_type}`;
    const existingUri = restoredByFile.get(fileKey);
    if (existingUri) {
      downloaded.push({ ...media, local_uri: existingUri });
      continue;
    }
    try {
      const restored = await downloadMedia(ownerId, media, directory);
      restoredByFile.set(fileKey, restored.local_uri);
      downloaded.push(restored);
    } catch {
      failedMediaCount += 1;
    }
  }

  const usage = usageResult.data as { bytes_used?: number; bytes_limit?: number } | null;
  return {
    adult: (adultResult.data as RemoteAdultProfile | null) ?? null,
    children,
    sketchpads,
    artworks,
    tags,
    artworkTags,
    mediaFiles: downloaded,
    tombstones,
    cloudBytes: typeof usage?.bytes_used === "number" ? usage.bytes_used : 0,
    cloudLimit: typeof usage?.bytes_limit === "number" ? usage.bytes_limit : 2 * 1024 * 1024 * 1024,
    failedMediaCount,
  };
}

export async function restoreCloudAccount(
  ownerId: string,
  deviceId?: string | null,
): Promise<CloudRestoreResult> {
  const snapshot = await fetchRemoteSnapshot(ownerId);
  const result = await restoreBukiCloudSnapshot(ownerId, snapshot);
  if (deviceId) {
    await getSupabaseClient()
      .from("sync_devices")
      .update({ last_pulled_at: result.restoredAt })
      .eq("owner_id", ownerId)
      .eq("device_id", deviceId);
  }
  return result;
}
