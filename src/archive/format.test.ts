import {
  BUKI_ARCHIVE_FORMAT,
  BUKI_ARCHIVE_VERSION,
  archiveMedia,
  parseBukiArchiveManifest,
  type BukiArchiveManifest,
} from "./format";

const manifest: BukiArchiveManifest = {
  format: BUKI_ARCHIVE_FORMAT,
  version: BUKI_ARCHIVE_VERSION,
  exportedAt: "2026-08-08T12:00:00.000Z",
  appVersion: "1.0.1",
  children: [{
    id: "child-1",
    name: "Ava",
    avatarColor: "#FFD65A",
    birthMonth: 4,
    birthYear: 2020,
    createdAt: 1_700_000_000_000,
  }],
  sketchpads: [{
    id: "pad-1",
    childId: "child-1",
    name: "My Book",
    style: "spread",
    design: "sunshine",
    border: "none",
    decoration: "none",
    coverColor: "#4A79D8",
    pageColor: "#FFFDF4",
    createdAt: 1_700_000_000_000,
  }],
  artworks: [{
    id: "art-1",
    sketchpadId: "pad-1",
    width: 640,
    height: 480,
    rotation: 0,
    addedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    title: "Sun",
    notes: null,
    favorite: false,
    tags: ["yellow"],
    cutout: {
      path: "media/artwork-000001/cutout.png",
      checksum: "a".repeat(64),
      byteSize: 120,
      mimeType: "image/png",
    },
    original: null,
  }],
};

describe("Buki archive format", () => {
  it("accepts a valid versioned manifest and lists its media", () => {
    const parsed = parseBukiArchiveManifest(manifest);
    expect(parsed.version).toBe(1);
    expect(archiveMedia(parsed)).toEqual([manifest.artworks[0].cutout]);
  });

  it("rejects an unsupported version", () => {
    expect(() => parseBukiArchiveManifest({ ...manifest, version: 2 })).toThrow("Invalid Buki archive manifest");
  });

  it("rejects path traversal and malformed checksums", () => {
    const artwork = manifest.artworks[0];
    expect(() => parseBukiArchiveManifest({
      ...manifest,
      artworks: [{ ...artwork, cutout: { ...artwork.cutout!, path: "../../private.txt" } }],
    })).toThrow("Invalid Buki archive manifest");
    expect(() => parseBukiArchiveManifest({
      ...manifest,
      artworks: [{ ...artwork, cutout: { ...artwork.cutout!, checksum: "not-a-checksum" } }],
    })).toThrow("Invalid Buki archive manifest");
  });

  it("rejects broken relationships and duplicate media paths", () => {
    expect(() => parseBukiArchiveManifest({
      ...manifest,
      artworks: [{ ...manifest.artworks[0], sketchpadId: "missing-pad" }],
    })).toThrow("references a sketchpad");
    expect(() => parseBukiArchiveManifest({
      ...manifest,
      artworks: [manifest.artworks[0], { ...manifest.artworks[0], id: "art-2" }],
    })).toThrow("duplicate media path");
  });

  it("requires every child to retain a sketchpad and checks media metadata consistency", () => {
    expect(() => parseBukiArchiveManifest({ ...manifest, sketchpads: [], artworks: [] })).toThrow("has no sketchpad");
    const artwork = manifest.artworks[0];
    expect(() => parseBukiArchiveManifest({
      ...manifest,
      artworks: [{
        ...artwork,
        original: {
          path: "media/artwork-000001/original.jpg",
          checksum: "b".repeat(64),
          byteSize: 80,
          mimeType: "image/png",
        },
      }],
    })).toThrow("inconsistent original-photo metadata");
  });
});
