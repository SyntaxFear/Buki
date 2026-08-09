import { z } from "zod";

import { isPadDesignId, type PadDesignId } from "@/pad-designs";
import {
  isPadBorderId,
  isPadDecorationId,
  type PadBorderId,
  type PadDecorationId,
} from "@/pad-visuals";
import { PAD_STYLES, type PadStyle } from "@/store/migrate";

export const BUKI_ARCHIVE_FORMAT = "buki-library-archive";
export const BUKI_ARCHIVE_VERSION = 1;
export const BUKI_ARCHIVE_MANIFEST_PATH = "manifest.json";

const idSchema = z.string().min(1).max(200).refine(
  (value) => value === value.trim(),
  "IDs cannot start or end with whitespace",
);
const timestampSchema = z.number().int().nonnegative().max(8_640_000_000_000_000);
const exportedAtSchema = z.string().min(20).max(100).refine(
  (value) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)),
  "Invalid archive export timestamp",
);
const mediaPathSchema = z.string().regex(/^media\/[a-z0-9-]+\/(cutout|original)\.(png|jpg|jpeg|heic|webp)$/);

const mediaSchema = z.strictObject({
  path: mediaPathSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mimeType: z.enum(["image/png", "image/jpeg", "image/heic", "image/webp"]),
});

const childSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  avatarColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  birthMonth: z.number().int().min(1).max(12).nullable(),
  birthYear: z.number().int().min(1900).max(2200).nullable(),
  createdAt: timestampSchema,
});

const padStyleSchema = z.custom<PadStyle>(
  (value) => typeof value === "string" && PAD_STYLES.includes(value as PadStyle),
  "Unsupported sketchpad layout",
);
const padDesignSchema = z.custom<PadDesignId>(isPadDesignId, "Unsupported sketchpad design");
const padBorderSchema = z.custom<PadBorderId>(isPadBorderId, "Unsupported sketchpad border");
const padDecorationSchema = z.custom<PadDecorationId>(isPadDecorationId, "Unsupported sketchpad decoration");

const sketchpadSchema = z.strictObject({
  id: idSchema,
  childId: idSchema,
  name: z.string().trim().min(1).max(100),
  style: padStyleSchema,
  design: padDesignSchema,
  border: padBorderSchema,
  decoration: padDecorationSchema,
  coverColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  pageColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).nullable(),
  createdAt: timestampSchema,
});

const artworkSchema = z.strictObject({
  id: idSchema,
  sketchpadId: idSchema,
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  rotation: z.number().finite().min(-360).max(360),
  addedAt: timestampSchema,
  updatedAt: timestampSchema,
  title: z.string().max(100).nullable(),
  notes: z.string().max(10_000).nullable(),
  favorite: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(40)).max(100),
  cutout: mediaSchema.nullable(),
  original: mediaSchema.nullable(),
});

const manifestSchema = z.strictObject({
  format: z.literal(BUKI_ARCHIVE_FORMAT),
  version: z.literal(BUKI_ARCHIVE_VERSION),
  exportedAt: exportedAtSchema,
  appVersion: z.string().trim().min(1).max(50),
  children: z.array(childSchema).max(1_000),
  sketchpads: z.array(sketchpadSchema).max(100_000),
  artworks: z.array(artworkSchema).max(1_000_000),
});

export type BukiArchiveMedia = z.infer<typeof mediaSchema>;
export type BukiArchiveChild = z.infer<typeof childSchema>;
export type BukiArchiveSketchpad = z.infer<typeof sketchpadSchema>;
export type BukiArchiveArtwork = z.infer<typeof artworkSchema>;
export type BukiArchiveManifest = z.infer<typeof manifestSchema>;

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`The Buki archive contains a duplicate ${label}.`);
    seen.add(value);
  }
}

export function parseBukiArchiveManifest(value: unknown): BukiArchiveManifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new Error(`Invalid Buki archive manifest${location}.`);
  }
  const manifest = result.data;
  ensureUnique(manifest.children.map((child) => child.id), "child ID");
  ensureUnique(manifest.sketchpads.map((pad) => pad.id), "sketchpad ID");
  ensureUnique(manifest.artworks.map((artwork) => artwork.id), "artwork ID");

  const childIds = new Set(manifest.children.map((child) => child.id));
  const padIds = new Set(manifest.sketchpads.map((pad) => pad.id));
  const childIdsWithPads = new Set(manifest.sketchpads.map((pad) => pad.childId));
  for (const child of manifest.children) {
    if (!childIdsWithPads.has(child.id)) {
      throw new Error(`Child ${child.id} has no sketchpad in the archive.`);
    }
  }
  for (const pad of manifest.sketchpads) {
    if (!childIds.has(pad.childId)) {
      throw new Error(`Sketchpad ${pad.id} references a child that is not in the archive.`);
    }
  }
  for (const artwork of manifest.artworks) {
    if (!padIds.has(artwork.sketchpadId)) {
      throw new Error(`Artwork ${artwork.id} references a sketchpad that is not in the archive.`);
    }
    if (artwork.cutout && (!artwork.cutout.path.endsWith("/cutout.png") || artwork.cutout.mimeType !== "image/png")) {
      throw new Error(`Artwork ${artwork.id} has an unsupported cutout format.`);
    }
    if (artwork.original) {
      const extension = artwork.original.path.split(".").pop();
      const expectedMime = extension === "png"
        ? "image/png"
        : extension === "heic"
          ? "image/heic"
          : extension === "webp"
            ? "image/webp"
            : "image/jpeg";
      if (artwork.original.mimeType !== expectedMime) {
        throw new Error(`Artwork ${artwork.id} has inconsistent original-photo metadata.`);
      }
    }
  }

  const paths = manifest.artworks.flatMap((artwork) =>
    [artwork.cutout?.path, artwork.original?.path].filter((path): path is string => Boolean(path)),
  );
  ensureUnique(paths, "media path");
  return manifest;
}

export function archiveMedia(manifest: BukiArchiveManifest): BukiArchiveMedia[] {
  return manifest.artworks.flatMap((artwork) =>
    [artwork.cutout, artwork.original].filter((media): media is BukiArchiveMedia => media !== null),
  );
}

export function isSafeArchiveEntryPath(path: string): boolean {
  return path === BUKI_ARCHIVE_MANIFEST_PATH || path === "README.txt" || mediaPathSchema.safeParse(path).success;
}
