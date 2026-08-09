import { File, Paths } from "expo-file-system";
import { strToU8, zipSync, type Zippable } from "fflate";

import { artworkExportBaseName } from "./artwork-export";
import { requireExportAccess } from "./export-access";
import { escapeCsv, exportSlug } from "./export-utils";
import type { Drawing, Sketchpad } from "@/store/migrate";

export const SKETCHPAD_ZIP_FORMAT = "buki-sketchpad-export";
export const SKETCHPAD_ZIP_VERSION = 1;

export interface SketchpadZipArtwork {
  id: string;
  title: string | null;
  notes: string | null;
  favorite: boolean;
  tags: string[];
  addedAt: string;
  updatedAt: string;
  width: number;
  height: number;
  rotation: number;
  imageFile: string | null;
  originalFile: string | null;
  mediaMissing: boolean;
}

export interface SketchpadZipManifest {
  format: typeof SKETCHPAD_ZIP_FORMAT;
  version: typeof SKETCHPAD_ZIP_VERSION;
  exportedAt: string;
  childName: string | null;
  sketchpad: {
    id: string;
    name: string;
    style: Sketchpad["style"];
    design: Sketchpad["design"];
    border: Sketchpad["border"];
    decoration: Sketchpad["decoration"];
    coverColor: string;
    pageColor: string | null;
    createdAt: string;
  };
  artworks: SketchpadZipArtwork[];
  missingFiles: Array<{ artworkId: string; kind: "artwork" | "original" }>;
}

export interface SketchpadZipResult {
  uri: string;
  filename: string;
  artworkCount: number;
  missingCount: number;
}

interface MediaPlan {
  drawing: Drawing;
  imageFile: string;
  originalFile: string | null;
}

function safeDate(value: number): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date(0).toISOString() : date.toISOString();
}

function originalExtension(uri: string): string {
  const clean = uri.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".heic") || clean.endsWith(".heif")) return "heic";
  if (clean.endsWith(".webp")) return "webp";
  return "jpg";
}

function mediaPlan(drawings: Drawing[]): MediaPlan[] {
  return drawings.map((drawing, index) => {
    const order = String(index + 1).padStart(3, "0");
    const id = exportSlug(drawing.id, `artwork-${order}`).slice(-16);
    const base = `${order}-${artworkExportBaseName(drawing).replace(/^buki-/, "")}-${id}`;
    return {
      drawing,
      imageFile: `images/${base}.png`,
      originalFile: drawing.photoUri ? `originals/${base}.${originalExtension(drawing.photoUri)}` : null,
    };
  });
}

export function buildSketchpadZipManifest(input: {
  pad: Sketchpad;
  media: Array<{
    drawing: Drawing;
    imageFile: string | null;
    originalFile: string | null;
    missingArtwork?: boolean;
    missingOriginal?: boolean;
  }>;
  childName?: string;
  generatedAt?: number;
}): SketchpadZipManifest {
  const missingFiles: SketchpadZipManifest["missingFiles"] = [];
  const artworks = input.media.map((item): SketchpadZipArtwork => {
    if (item.missingArtwork) {
      missingFiles.push({ artworkId: item.drawing.id, kind: "artwork" });
    }
    if (item.missingOriginal && item.drawing.photoUri) {
      missingFiles.push({ artworkId: item.drawing.id, kind: "original" });
    }
    return {
      id: item.drawing.id,
      title: item.drawing.title?.trim() || null,
      notes: item.drawing.notes?.trim() || null,
      favorite: item.drawing.favorite === true,
      tags: item.drawing.tags ?? [],
      addedAt: safeDate(item.drawing.addedAt),
      updatedAt: safeDate(item.drawing.updatedAt ?? item.drawing.addedAt),
      width: item.drawing.width,
      height: item.drawing.height,
      rotation: item.drawing.rotation,
      imageFile: item.imageFile,
      originalFile: item.originalFile,
      mediaMissing: Boolean(item.missingArtwork || item.missingOriginal),
    };
  });
  return {
    format: SKETCHPAD_ZIP_FORMAT,
    version: SKETCHPAD_ZIP_VERSION,
    exportedAt: safeDate(input.generatedAt ?? Date.now()),
    childName: input.childName?.trim() || null,
    sketchpad: {
      id: input.pad.id,
      name: input.pad.name,
      style: input.pad.style,
      design: input.pad.design,
      border: input.pad.border,
      decoration: input.pad.decoration,
      coverColor: input.pad.coverColor,
      pageColor: input.pad.pageColor ?? null,
      createdAt: safeDate(input.pad.createdAt),
    },
    artworks,
    missingFiles,
  };
}

export function sketchpadMetadataCsv(manifest: SketchpadZipManifest): string {
  const header = [
    "id",
    "title",
    "notes",
    "favorite",
    "tags",
    "added_at",
    "updated_at",
    "width",
    "height",
    "rotation",
    "sketchpad",
    "image_file",
    "original_file",
    "media_missing",
  ];
  const rows = manifest.artworks.map((artwork) =>
    [
      artwork.id,
      artwork.title,
      artwork.notes,
      artwork.favorite,
      artwork.tags.join(" | "),
      artwork.addedAt,
      artwork.updatedAt,
      artwork.width,
      artwork.height,
      artwork.rotation,
      manifest.sketchpad.name,
      artwork.imageFile,
      artwork.originalFile,
      artwork.mediaMissing,
    ].map(escapeCsv).join(","),
  );
  return [header.join(","), ...rows].join("\r\n");
}

export function sketchpadZipFilename(pad: Pick<Sketchpad, "name" | "id">): string {
  return `buki-${exportSlug(pad.name, exportSlug(pad.id, "sketchpad"))}-export.zip`;
}

export async function createSketchpadZip(input: {
  pad: Sketchpad;
  drawings: Drawing[];
  childName?: string;
}): Promise<SketchpadZipResult> {
  requireExportAccess("sketchpad_zip_export");
  const entries: Zippable = {};
  const manifestMedia: Parameters<typeof buildSketchpadZipManifest>[0]["media"] = [];

  for (const item of mediaPlan(input.drawings)) {
    const image = new File(item.drawing.uri);
    const imageExists = image.exists;
    if (imageExists) entries[item.imageFile] = await image.bytes();

    let originalExists = false;
    if (item.drawing.photoUri && item.originalFile) {
      const original = new File(item.drawing.photoUri);
      originalExists = original.exists;
      if (originalExists) entries[item.originalFile] = await original.bytes();
    }

    manifestMedia.push({
      drawing: item.drawing,
      imageFile: imageExists ? item.imageFile : null,
      originalFile: originalExists ? item.originalFile : null,
      missingArtwork: !imageExists,
      missingOriginal: Boolean(item.drawing.photoUri && !originalExists),
    });
  }

  const manifest = buildSketchpadZipManifest({
    pad: input.pad,
    media: manifestMedia,
    childName: input.childName,
  });
  entries["metadata.json"] = strToU8(JSON.stringify(manifest, null, 2));
  entries["metadata.csv"] = strToU8(sketchpadMetadataCsv(manifest));
  entries["README.txt"] = strToU8(
    "Buki sketchpad export\n\nOpen metadata.json for complete structured details or metadata.csv for a spreadsheet-friendly list. Images and available original photos are stored in their matching folders.\n",
  );
  if (manifest.missingFiles.length) {
    entries["missing-media.json"] = strToU8(JSON.stringify(manifest.missingFiles, null, 2));
  }

  const zip = zipSync(entries, { level: 0, mtime: new Date(manifest.exportedAt) });
  const filename = sketchpadZipFilename(input.pad);
  const destination = new File(Paths.cache, filename);
  try {
    requireExportAccess("sketchpad_zip_export_commit");
    destination.write(zip);
    requireExportAccess("sketchpad_zip_export_complete");
    return {
      uri: destination.uri,
      filename,
      artworkCount: input.drawings.length,
      missingCount: manifest.missingFiles.length,
    };
  } catch (error) {
    try { if (destination.exists) destination.delete(); } catch {}
    throw error;
  }
}
