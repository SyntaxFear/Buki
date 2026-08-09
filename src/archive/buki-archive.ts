import * as Application from "expo-application";
import { randomUUID } from "expo-crypto";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import {
  Unzip,
  UnzipInflate,
  Zip,
  ZipPassThrough,
  strToU8,
} from "fflate";

import {
  flushLibraryWrites,
  importBukiLibraryArchive,
  loadBukiProfiles,
  loadLibrarySnapshot,
  type ImportedArchiveLibrary,
} from "@/database";
import type { LocalChildProfile } from "@/database/profile-repository";
import { requireExportAccess } from "@/export/export-access";
import type { Drawing, Sketchpad } from "@/store/migrate";
import { useDrawings } from "@/store/drawings";
import { currentCapabilities } from "@/store/membership";
import { useProfiles } from "@/store/profiles";
import { sha256Digest } from "@/utils/crypto";
import {
  BUKI_ARCHIVE_FORMAT,
  BUKI_ARCHIVE_LIMITS,
  BUKI_ARCHIVE_MANIFEST_PATH,
  BUKI_ARCHIVE_VERSION,
  archiveMedia,
  isSafeArchiveEntryPath,
  parseBukiArchiveManifest,
  type BukiArchiveManifest,
  type BukiArchiveMedia,
} from "./format";
import { emptyPadSignature, planBukiArchiveImport } from "./import-plan";

const ARCHIVE_CHUNK_SIZE = 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = (BUKI_ARCHIVE_LIMITS.maxArtworks * 2) + 2;
const MIN_EXTRACTED_BUDGET = 64 * 1024 * 1024;
const EXTRACTION_OVERHEAD = 16 * 1024 * 1024;
const DISK_SPACE_RESERVE = 128 * 1024 * 1024;

interface ArchiveSourceEntry {
  path: string;
  source: File;
}

export interface BukiArchiveExportResult {
  uri: string;
  filename: string;
  children: number;
  sketchpads: number;
  artworks: number;
  missingMedia: number;
}

export interface BukiArchiveImportResult {
  childrenAdded: number;
  sketchpadsAdded: number;
  artworksAdded: number;
  duplicatesSkipped: number;
  missingSkipped: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256File(file: File): Promise<string> {
  const bytes = await file.bytes();
  const digest = await sha256Digest(bytes);
  return bytesToHex(new Uint8Array(digest));
}

function photoFormat(uri: string): { extension: string; mimeType: BukiArchiveMedia["mimeType"] } {
  const clean = uri.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".png")) return { extension: "png", mimeType: "image/png" };
  if (clean.endsWith(".heic") || clean.endsWith(".heif")) return { extension: "heic", mimeType: "image/heic" };
  if (clean.endsWith(".webp")) return { extension: "webp", mimeType: "image/webp" };
  return { extension: "jpg", mimeType: "image/jpeg" };
}

async function describeMedia(
  uri: string | undefined,
  path: string,
  mimeType: BukiArchiveMedia["mimeType"],
): Promise<{ media: BukiArchiveMedia | null; source: ArchiveSourceEntry | null }> {
  if (!uri) return { media: null, source: null };
  const file = new File(uri);
  if (!file.exists || file.size <= 0) return { media: null, source: null };
  const checksum = await sha256File(file);
  return {
    media: { path, checksum, byteSize: file.size, mimeType },
    source: { path, source: file },
  };
}

function pushBytes(zip: Zip, path: string, bytes: Uint8Array, mtime: Date): void {
  const stream = new ZipPassThrough(path);
  stream.mtime = mtime;
  zip.add(stream);
  stream.push(bytes, true);
}

function pushFile(zip: Zip, entry: ArchiveSourceEntry, mtime: Date): void {
  const stream = new ZipPassThrough(entry.path);
  stream.mtime = mtime;
  zip.add(stream);
  const input = entry.source.open(FileMode.ReadOnly);
  try {
    let remaining = entry.source.size;
    if (remaining === 0) {
      stream.push(new Uint8Array(), true);
      return;
    }
    while (remaining > 0) {
      const chunk = input.readBytes(Math.min(ARCHIVE_CHUNK_SIZE, remaining));
      if (chunk.length === 0) throw new Error(`Could not read ${entry.path}.`);
      remaining -= chunk.length;
      stream.push(chunk, remaining === 0);
    }
  } finally {
    input.close();
  }
}

async function writeArchiveZip(
  destination: File,
  manifest: BukiArchiveManifest,
  mediaEntries: ArchiveSourceEntry[],
): Promise<void> {
  destination.create({ overwrite: true, intermediates: true });
  const output = destination.open(FileMode.Truncate);
  const mtime = new Date(manifest.exportedAt);
  let settled = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try { output.close(); } catch {}
        reject(error instanceof Error ? error : new Error("Could not create the Buki archive."));
      };
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          fail(error);
          return;
        }
        if (settled) return;
        try {
          output.writeBytes(chunk);
          if (final) {
            settled = true;
            output.close();
            resolve();
          }
        } catch (writeError) {
          fail(writeError);
        }
      });

      try {
        pushBytes(zip, BUKI_ARCHIVE_MANIFEST_PATH, strToU8(JSON.stringify(manifest, null, 2)), mtime);
        pushBytes(
          zip,
          "README.txt",
          strToU8(
            "Buki library archive\n\nThis versioned archive contains child profile fields, sketchpads, artwork metadata, checksums, and available media. It does not contain sign-in credentials, subscription data, or adult account secrets. Import it from Buki's Account Center.\n",
          ),
          mtime,
        );
        for (const entry of mediaEntries) pushFile(zip, entry, mtime);
        zip.end();
      } catch (error) {
        fail(error);
      }
    });
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

function archiveFilename(timestamp: number): string {
  return `buki-library-${new Date(timestamp).toISOString().slice(0, 10)}.buki`;
}

export async function createBukiArchive(): Promise<BukiArchiveExportResult> {
  requireExportAccess("archive_export");
  await flushLibraryWrites();
  const [profiles, library] = await Promise.all([loadBukiProfiles(), loadLibrarySnapshot()]);
  if (!profiles.ownerId) throw new Error("Sign in before creating a Buki archive.");

  const exportedAt = Date.now();
  let artworkIndex = 0;
  let missingMedia = 0;
  const mediaEntries: ArchiveSourceEntry[] = [];
  const artworks: BukiArchiveManifest["artworks"] = [];

  for (const pad of library.pads) {
    for (const drawing of library.drawingsByPad[pad.id] ?? []) {
      artworkIndex += 1;
      const folder = `media/artwork-${String(artworkIndex).padStart(6, "0")}`;
      const cutout = await describeMedia(drawing.uri, `${folder}/cutout.png`, "image/png");
      if (!cutout.media) missingMedia += 1;
      if (cutout.source) mediaEntries.push(cutout.source);

      const photo = photoFormat(drawing.photoUri ?? "");
      const original = drawing.photoUri
        ? await describeMedia(drawing.photoUri, `${folder}/original.${photo.extension}`, photo.mimeType)
        : { media: null, source: null };
      if (drawing.photoUri && !original.media) missingMedia += 1;
      if (original.source) mediaEntries.push(original.source);

      artworks.push({
        id: drawing.id,
        sketchpadId: pad.id,
        width: drawing.width,
        height: drawing.height,
        rotation: drawing.rotation,
        addedAt: drawing.addedAt,
        updatedAt: drawing.updatedAt ?? drawing.addedAt,
        title: drawing.title?.trim() || null,
        notes: drawing.notes?.trim() || null,
        favorite: drawing.favorite === true,
        tags: drawing.tags ?? [],
        cutout: cutout.media,
        original: original.media,
      });
    }
  }

  const manifest = parseBukiArchiveManifest({
    format: BUKI_ARCHIVE_FORMAT,
    version: BUKI_ARCHIVE_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    appVersion: Application.nativeApplicationVersion ?? "1.0.0",
    children: profiles.children.map((child) => ({
      id: child.id,
      name: child.name,
      avatarColor: child.avatarColor,
      birthMonth: child.birthMonth,
      birthYear: child.birthYear,
      createdAt: child.createdAt,
    })),
    sketchpads: library.pads.map((pad) => ({
      id: pad.id,
      childId: pad.childId,
      name: pad.name,
      style: pad.style,
      design: pad.design,
      border: pad.border,
      decoration: pad.decoration,
      coverColor: pad.coverColor,
      pageColor: pad.pageColor ?? null,
      createdAt: pad.createdAt,
    })),
    artworks,
  });
  const filename = archiveFilename(exportedAt);
  const destination = new File(Paths.cache, filename);
  try {
    requireExportAccess("archive_export_commit");
    await writeArchiveZip(destination, manifest, mediaEntries);
    requireExportAccess("archive_export_complete");
    return {
      uri: destination.uri,
      filename,
      children: manifest.children.length,
      sketchpads: manifest.sketchpads.length,
      artworks: manifest.artworks.length,
      missingMedia,
    };
  } catch (error) {
    try { if (destination.exists) destination.delete(); } catch {}
    throw error;
  }
}

interface ExtractedArchive {
  directory: Directory;
  entries: Set<string>;
}

function extractedFile(directory: Directory, path: string): File {
  return new File(directory, ...path.split("/"));
}

function deleteDirectoryQuietly(directory: Directory): void {
  try {
    if (directory.exists) directory.delete();
  } catch {}
}

function archiveEntryByteLimit(path: string): number {
  if (path === BUKI_ARCHIVE_MANIFEST_PATH) return BUKI_ARCHIVE_LIMITS.maxManifestBytes;
  if (path === "README.txt") return BUKI_ARCHIVE_LIMITS.maxReadmeBytes;
  return BUKI_ARCHIVE_LIMITS.maxMediaBytes;
}

export function archiveExtractionBudget(sourceBytes: number, availableDiskSpace?: number): number {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0) {
    throw new Error("The selected archive is empty or has an invalid size.");
  }
  if (sourceBytes > BUKI_ARCHIVE_LIMITS.maxExpandedBytes) {
    throw new Error("The selected archive is too large for one Buki import.");
  }
  const maximumExpanded = Math.min(
    BUKI_ARCHIVE_LIMITS.maxExpandedBytes,
    Math.max(MIN_EXTRACTED_BUDGET, (sourceBytes * 2) + EXTRACTION_OVERHEAD),
  );
  if (
    typeof availableDiskSpace === "number"
    && Number.isFinite(availableDiskSpace)
    && availableDiskSpace >= 0
    && availableDiskSpace < maximumExpanded + DISK_SPACE_RESERVE
  ) {
    throw new Error("This device does not have enough free space to safely import the archive.");
  }
  return maximumExpanded;
}

function extractArchive(source: File): ExtractedArchive {
  if (!source.exists) throw new Error("The selected Buki archive is unavailable.");
  const maximumExpanded = archiveExtractionBudget(source.size, Paths.availableDiskSpace);
  const directory = new Directory(Paths.cache, `buki-import-${randomUUID()}`);
  directory.create({ intermediates: true });
  const entries = new Set<string>();
  const handles = new Set<ReturnType<File["open"]>>();
  let expandedBytes = 0;
  let extractionError: Error | null = null;

  try {
    const unzip = new Unzip((entry) => {
      if (extractionError) {
        entry.terminate();
        return;
      }
      if (!isSafeArchiveEntryPath(entry.name)) {
        extractionError = new Error("The archive contains an unsafe or unsupported file path.");
        entry.terminate();
        return;
      }
      if (entries.has(entry.name)) {
        extractionError = new Error("The archive contains a duplicate file entry.");
        entry.terminate();
        return;
      }
      if (entries.size >= MAX_ARCHIVE_ENTRIES) {
        extractionError = new Error("The archive contains too many files.");
        entry.terminate();
        return;
      }
      entries.add(entry.name);
      const maximumEntryBytes = archiveEntryByteLimit(entry.name);
      let entryBytes = 0;
      const destination = extractedFile(directory, entry.name);
      destination.create({ overwrite: true, intermediates: true });
      const output = destination.open(FileMode.Truncate);
      handles.add(output);
      entry.ondata = (error, chunk, final) => {
        if (error && !extractionError) extractionError = error;
        if (!extractionError) {
          entryBytes += chunk.length;
          expandedBytes += chunk.length;
          if (entryBytes > maximumEntryBytes) {
            extractionError = new Error(`The archive entry ${entry.name} is too large.`);
          } else if (expandedBytes > maximumExpanded) {
            extractionError = new Error("The archive expands beyond the safe import size for this device.");
          } else {
            try {
              output.writeBytes(chunk);
            } catch (writeError) {
              extractionError = writeError instanceof Error ? writeError : new Error("Could not extract the archive.");
            }
          }
        }
        if (final || extractionError) {
          try { output.close(); } catch {}
          handles.delete(output);
          if (extractionError) entry.terminate();
        }
      };
      entry.start();
    });
    unzip.register(UnzipInflate);
    const input = source.open(FileMode.ReadOnly);
    try {
      let remaining = source.size;
      if (remaining === 0) throw new Error("The selected archive is empty.");
      while (remaining > 0) {
        const chunk = input.readBytes(Math.min(ARCHIVE_CHUNK_SIZE, remaining));
        if (chunk.length === 0) throw new Error("Could not read the selected archive.");
        remaining -= chunk.length;
        unzip.push(chunk, remaining === 0);
        if (extractionError) throw extractionError;
      }
    } finally {
      input.close();
    }
    if (handles.size > 0) throw new Error("The archive did not finish extracting.");
    return { directory, entries };
  } catch (error) {
    for (const handle of handles) {
      try { handle.close(); } catch {}
    }
    deleteDirectoryQuietly(directory);
    throw error;
  }
}

async function readAndVerifyManifest(extracted: ExtractedArchive): Promise<BukiArchiveManifest> {
  const manifestFile = extractedFile(extracted.directory, BUKI_ARCHIVE_MANIFEST_PATH);
  if (!manifestFile.exists || manifestFile.size > BUKI_ARCHIVE_LIMITS.maxManifestBytes) {
    throw new Error("The selected file does not contain a valid Buki manifest.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await manifestFile.text());
  } catch {
    throw new Error("The Buki manifest is not valid JSON.");
  }
  const manifest = parseBukiArchiveManifest(raw);
  const allowed = new Set([BUKI_ARCHIVE_MANIFEST_PATH, "README.txt", ...archiveMedia(manifest).map((media) => media.path)]);
  for (const entry of extracted.entries) {
    if (!allowed.has(entry)) throw new Error(`The archive contains an unexpected file: ${entry}.`);
  }

  for (const media of archiveMedia(manifest)) {
    const file = extractedFile(extracted.directory, media.path);
    if (!file.exists) throw new Error(`The archive is missing ${media.path}.`);
    if (file.size !== media.byteSize) throw new Error(`The size check failed for ${media.path}.`);
    if ((await sha256File(file)) !== media.checksum) {
      throw new Error(`The checksum check failed for ${media.path}.`);
    }
  }
  return manifest;
}

async function currentArtworkChecksums(drawingsByPad: Record<string, Drawing[]>): Promise<string[]> {
  const checksums: string[] = [];
  for (const drawings of Object.values(drawingsByPad)) {
    for (const drawing of drawings) {
      const file = new File(drawing.uri);
      if (!file.exists) continue;
      checksums.push(await sha256File(file));
    }
  }
  return checksums;
}

function currentEmptyPadSignatures(
  children: LocalChildProfile[],
  pads: Sketchpad[],
  drawingsByPad: Record<string, Drawing[]>,
): string[] {
  const childCreatedAt = new Map(children.map((child) => [child.id, child.createdAt]));
  return pads
    .filter((pad) => (drawingsByPad[pad.id] ?? []).length === 0)
    .map((pad) => emptyPadSignature(childCreatedAt.get(pad.childId) ?? 0, pad));
}

function ensureDirectory(name: string): Directory {
  const directory = new Directory(Paths.document, name);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function importedDestination(directory: Directory, id: string, extension: string): File {
  return new File(directory, `import-${id}.${extension}`);
}

function extensionFromMedia(media: BukiArchiveMedia): string {
  return media.path.split(".").pop() || (media.mimeType === "image/png" ? "png" : "jpg");
}

export async function importBukiArchive(uri: string): Promise<BukiArchiveImportResult> {
  requireExportAccess("archive_import");
  await flushLibraryWrites();
  const extracted = extractArchive(new File(uri));
  const createdFiles: File[] = [];
  let committed = false;

  try {
    const manifest = await readAndVerifyManifest(extracted);
    const [profiles, library] = await Promise.all([loadBukiProfiles(), loadLibrarySnapshot()]);
    if (!profiles.ownerId) throw new Error("Sign in before importing a Buki archive.");
    const plan = planBukiArchiveImport(
      manifest,
      {
        childNames: profiles.children.map((child) => child.name),
        emptyPadSignatures: currentEmptyPadSignatures(profiles.children, library.pads, library.drawingsByPad),
        artworkChecksums: await currentArtworkChecksums(library.drawingsByPad),
      },
      () => randomUUID(),
    );

    if (plan.children.length === 0) {
      return {
        childrenAdded: 0,
        sketchpadsAdded: 0,
        artworksAdded: 0,
        duplicatesSkipped: plan.duplicatesSkipped,
        missingSkipped: plan.missingSkipped,
      };
    }

    const drawingsDirectory = ensureDirectory("drawings");
    const photosDirectory = ensureDirectory("photos");
    const imported: ImportedArchiveLibrary = {
      children: [],
      pads: [],
      drawingsByPad: {},
      mediaChecksums: {},
    };

    for (const child of plan.children) {
      imported.children.push({
        id: child.id,
        name: child.name,
        avatarColor: child.source.avatarColor,
        birthMonth: child.source.birthMonth,
        birthYear: child.source.birthYear,
        createdAt: child.source.createdAt,
      });
      for (const pad of child.pads) {
        imported.pads.push({
          id: pad.id,
          childId: child.id,
          name: pad.source.name,
          style: pad.source.style,
          design: pad.source.design,
          border: pad.source.border,
          decoration: pad.source.decoration,
          coverColor: pad.source.coverColor,
          pageColor: pad.source.pageColor ?? undefined,
          createdAt: pad.source.createdAt,
        });
        imported.drawingsByPad[pad.id] = [];

        for (const artwork of pad.artworks) {
          const cutoutMedia = artwork.source.cutout;
          if (!cutoutMedia) continue;
          const cutout = importedDestination(drawingsDirectory, artwork.id, extensionFromMedia(cutoutMedia));
          createdFiles.push(cutout);
          await extractedFile(extracted.directory, cutoutMedia.path).copy(cutout);

          let photoUri: string | undefined;
          if (artwork.source.original) {
            const original = importedDestination(photosDirectory, artwork.id, extensionFromMedia(artwork.source.original));
            createdFiles.push(original);
            await extractedFile(extracted.directory, artwork.source.original.path).copy(original);
            photoUri = original.uri;
          }

          imported.drawingsByPad[pad.id].push({
            id: artwork.id,
            uri: cutout.uri,
            photoUri,
            width: artwork.source.width,
            height: artwork.source.height,
            rotation: artwork.source.rotation,
            addedAt: artwork.source.addedAt,
            updatedAt: artwork.source.updatedAt,
            title: artwork.source.title ?? undefined,
            notes: artwork.source.notes ?? undefined,
            favorite: artwork.source.favorite,
            tags: artwork.source.tags,
          });
          imported.mediaChecksums[artwork.id] = {
            cutout: cutoutMedia.checksum,
            original: artwork.source.original?.checksum,
          };
        }
      }
    }

    await importBukiLibraryArchive(imported, {
      getCapabilities: currentCapabilities,
      assertWriteAllowed: () => {
        requireExportAccess("archive_import_commit");
      },
    });
    committed = true;
    await Promise.allSettled([
      useProfiles.getState().reloadForAccount(),
      useDrawings.getState().reloadForAccount(),
    ]);
    return {
      childrenAdded: imported.children.length,
      sketchpadsAdded: imported.pads.length,
      artworksAdded: Object.values(imported.drawingsByPad).reduce((sum, drawings) => sum + drawings.length, 0),
      duplicatesSkipped: plan.duplicatesSkipped,
      missingSkipped: plan.missingSkipped,
    };
  } catch (error) {
    if (!committed) {
      for (const file of createdFiles) {
        try { if (file.exists) file.delete(); } catch {}
      }
    }
    throw error;
  } finally {
    deleteDirectoryQuietly(extracted.directory);
  }
}
