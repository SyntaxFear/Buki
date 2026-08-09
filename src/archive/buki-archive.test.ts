import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const mockFlushLibraryWrites = jest.fn();
const mockImportBukiLibraryArchive = jest.fn();
const mockLoadBukiProfiles = jest.fn();
const mockLoadLibrarySnapshot = jest.fn();
const mockRequireExportAccess = jest.fn();
const mockReloadDrawings = jest.fn();
const mockReloadProfiles = jest.fn();
let mockCopyFailureDestinationPrefix: string | null = null;

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.1",
}));

jest.mock("expo-crypto", () => {
  let nextUuid = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    randomUUID: jest.fn(() => {
      nextUuid += 1;
      return `00000000-0000-4000-8000-${String(nextUuid).padStart(12, "0")}`;
    }),
    digest: jest.fn(async (_algorithm: string, bytes: Uint8Array) => {
      return globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    }),
  };
});

jest.mock("expo-file-system", () => {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>(["mem://cache", "mem://document"]);
  const normalize = (value: unknown): string => {
    if (typeof value === "string") return value.replace(/\/$/, "");
    if (value && typeof value === "object" && "uri" in value) {
      return String((value as { uri: string }).uri).replace(/\/$/, "");
    }
    return String(value).replace(/\/$/, "");
  };
  const join = (parts: unknown[]): string => {
    const [first, ...rest] = parts;
    return [normalize(first), ...rest.map((part) => String(part).replace(/^\/+|\/+$/g, ""))]
      .filter(Boolean)
      .join("/");
  };
  const clone = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes);
  const append = (left: Uint8Array, right: Uint8Array): Uint8Array => {
    const combined = new Uint8Array(left.length + right.length);
    combined.set(left);
    combined.set(right, left.length);
    return combined;
  };

  class MockFile {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }

    get exists(): boolean {
      return files.has(this.uri);
    }

    get size(): number {
      return files.get(this.uri)?.length ?? 0;
    }

    create(options?: { overwrite?: boolean }): void {
      if (this.exists && !options?.overwrite) throw new Error(`File already exists: ${this.uri}`);
      files.set(this.uri, new Uint8Array());
    }

    delete(): void {
      files.delete(this.uri);
    }

    async bytes(): Promise<Uint8Array> {
      const value = files.get(this.uri);
      if (!value) throw new Error(`Missing file: ${this.uri}`);
      return clone(value);
    }

    async text(): Promise<string> {
      return new TextDecoder().decode(await this.bytes());
    }

    write(bytes: Uint8Array): void {
      files.set(this.uri, clone(bytes));
    }

    async copy(destination: MockFile, options?: { overwrite?: boolean }): Promise<void> {
      if (destination.exists && !options?.overwrite) {
        throw new Error(`File already exists: ${destination.uri}`);
      }
      destination.write(await this.bytes());
      if (
        mockCopyFailureDestinationPrefix
        && destination.uri.startsWith(mockCopyFailureDestinationPrefix)
      ) {
        throw new Error(`Injected copy failure for ${destination.uri}`);
      }
    }

    open(mode: string) {
      if (mode === "read") {
        const value = files.get(this.uri);
        if (!value) throw new Error(`Missing file: ${this.uri}`);
        let offset = 0;
        return {
          readBytes: (count: number) => {
            const chunk = value.slice(offset, offset + count);
            offset += chunk.length;
            return chunk;
          },
          close: jest.fn(),
        };
      }
      files.set(this.uri, new Uint8Array());
      return {
        writeBytes: (chunk: Uint8Array) => {
          files.set(this.uri, append(files.get(this.uri) ?? new Uint8Array(), chunk));
        },
        close: jest.fn(),
      };
    }
  }

  class MockDirectory {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }

    get exists(): boolean {
      return directories.has(this.uri);
    }

    create(): void {
      directories.add(this.uri);
    }

    delete(): void {
      for (const path of [...files.keys()]) {
        if (path === this.uri || path.startsWith(`${this.uri}/`)) files.delete(path);
      }
      for (const path of [...directories]) {
        if (path === this.uri || path.startsWith(`${this.uri}/`)) directories.delete(path);
      }
    }
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    FileMode: { ReadOnly: "read", Truncate: "truncate" },
    Paths: { cache: "mem://cache", document: "mem://document" },
    __files: files,
    __directories: directories,
    __reset: () => {
      files.clear();
      directories.clear();
      directories.add("mem://cache");
      directories.add("mem://document");
    },
  };
});

jest.mock("@/database", () => ({
  flushLibraryWrites: (...args: unknown[]) => mockFlushLibraryWrites(...args),
  importBukiLibraryArchive: (...args: unknown[]) => mockImportBukiLibraryArchive(...args),
  loadBukiProfiles: (...args: unknown[]) => mockLoadBukiProfiles(...args),
  loadLibrarySnapshot: (...args: unknown[]) => mockLoadLibrarySnapshot(...args),
}));

jest.mock("@/export/export-access", () => ({
  requireExportAccess: (source: string) => mockRequireExportAccess(source),
}));

jest.mock("@/store/drawings", () => ({
  useDrawings: { getState: () => ({ reloadForAccount: mockReloadDrawings }) },
}));

jest.mock("@/store/membership", () => ({
  currentCapabilities: () => ({ exportData: true }),
}));

jest.mock("@/store/profiles", () => ({
  useProfiles: { getState: () => ({ reloadForAccount: mockReloadProfiles }) },
}));

import { archiveExtractionBudget, createBukiArchive, importBukiArchive } from "./buki-archive";
import { BUKI_ARCHIVE_LIMITS, type BukiArchiveManifest } from "./format";

interface MockFileSystem {
  __files: Map<string, Uint8Array>;
  __directories: Set<string>;
  __reset: () => void;
}

const mockFileSystem = jest.requireMock("expo-file-system") as MockFileSystem;
const artworkBytes = strToU8("transparent-artwork-bytes");
const ARTWORK_CHECKSUM = "0ccc89861303e5459723caa50915145f1f394388e0201bfea8e326cf26b0c366";

function baseManifest(mediaBytes: Uint8Array = artworkBytes): BukiArchiveManifest {
  return {
    format: "buki-library-archive",
    version: 1,
    exportedAt: "2026-08-09T12:00:00.000Z",
    appVersion: "1.0.1",
    children: [{
      id: "child-a",
      name: "Ava",
      avatarColor: "#FFD65A",
      birthMonth: null,
      birthYear: null,
      createdAt: 1,
    }],
    sketchpads: [{
      id: "pad-a",
      childId: "child-a",
      name: "My Book",
      style: "spread",
      design: "sunshine",
      border: "none",
      decoration: "none",
      coverColor: "#FFD65A",
      pageColor: "#FFFDF4",
      createdAt: 2,
    }],
    artworks: [{
      id: "art-a",
      sketchpadId: "pad-a",
      width: 100,
      height: 120,
      rotation: 0,
      addedAt: 3,
      updatedAt: 4,
      title: "Sun",
      notes: "A bright day",
      favorite: true,
      tags: ["yellow"],
      cutout: {
        path: "media/artwork-000001/cutout.png",
        checksum: ARTWORK_CHECKSUM,
        byteSize: mediaBytes.length,
        mimeType: "image/png",
      },
      original: null,
    }],
  };
}

function archiveBytes(options?: {
  manifestMedia?: Uint8Array;
  storedMedia?: Uint8Array;
  extraEntries?: Record<string, Uint8Array>;
}): Uint8Array {
  const manifestMedia = options?.manifestMedia ?? artworkBytes;
  const storedMedia = options?.storedMedia ?? manifestMedia;
  const manifest = baseManifest(Uint8Array.from(manifestMedia));
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "README.txt": strToU8("Buki archive"),
    [manifest.artworks[0].cutout!.path]: storedMedia,
    ...(options?.extraEntries ?? {}),
  }, { level: 0 });
}

const emptyLibrary = {
  version: 5 as const,
  activePadId: "",
  pads: [],
  drawingsByPad: {},
};

describe("Buki archive ZIP integration", () => {
  beforeEach(() => {
    mockFileSystem.__reset();
    mockFlushLibraryWrites.mockReset().mockResolvedValue(undefined);
    mockImportBukiLibraryArchive.mockReset().mockImplementation(
      async (_imported: unknown, access: { assertWriteAllowed: () => void }) => {
        access.assertWriteAllowed();
      },
    );
    mockLoadBukiProfiles.mockReset().mockResolvedValue({ ownerId: "adult-a", children: [] });
    mockLoadLibrarySnapshot.mockReset().mockResolvedValue(emptyLibrary);
    mockRequireExportAccess.mockReset();
    mockReloadDrawings.mockReset().mockResolvedValue(undefined);
    mockReloadProfiles.mockReset().mockResolvedValue(undefined);
    mockCopyFailureDestinationPrefix = null;
  });

  it("creates a real versioned archive with matching media checksums", async () => {
    mockFileSystem.__files.set("mem://document/sun.png", artworkBytes);
    mockLoadBukiProfiles.mockResolvedValue({
      ownerId: "adult-a",
      children: [{
        id: "child-a",
        ownerId: "adult-a",
        name: "Ava",
        avatarColor: "#FFD65A",
        avatarUri: null,
        birthMonth: null,
        birthYear: null,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      }],
    });
    mockLoadLibrarySnapshot.mockResolvedValue({
      version: 5,
      activePadId: "pad-a",
      pads: [{
        id: "pad-a",
        childId: "child-a",
        name: "My Book",
        style: "spread",
        design: "sunshine",
        border: "none",
        decoration: "none",
        coverColor: "#FFD65A",
        pageColor: "#FFFDF4",
        createdAt: 2,
      }],
      drawingsByPad: {
        "pad-a": [{
          id: "art-a",
          uri: "mem://document/sun.png",
          width: 100,
          height: 120,
          rotation: 0,
          addedAt: 3,
          updatedAt: 4,
          title: "Sun",
          notes: "A bright day",
          favorite: true,
          tags: ["yellow"],
        }],
      },
    });

    const result = await createBukiArchive();
    const bytes = mockFileSystem.__files.get(result.uri);
    expect(bytes).toBeDefined();
    const entries = unzipSync(bytes!);
    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as BukiArchiveManifest;
    const media = manifest.artworks[0].cutout!;

    expect(manifest).toMatchObject({ format: "buki-library-archive", version: 1 });
    expect(entries[media.path]).toEqual(artworkBytes);
    expect(media.byteSize).toBe(artworkBytes.length);
    expect(media.checksum).toBe(ARTWORK_CHECKSUM);
    expect(mockRequireExportAccess.mock.calls.map(([source]) => source)).toEqual([
      "archive_export",
      "archive_export_commit",
      "archive_export_complete",
    ]);
  });

  it("restores a valid archive through the real unzip and checksum path", async () => {
    mockFileSystem.__files.set("mem://valid.buki", archiveBytes());

    await expect(importBukiArchive("mem://valid.buki")).resolves.toEqual({
      childrenAdded: 1,
      sketchpadsAdded: 1,
      artworksAdded: 1,
      duplicatesSkipped: 0,
      missingSkipped: 0,
    });

    expect(mockImportBukiLibraryArchive).toHaveBeenCalledTimes(1);
    const [imported, access] = mockImportBukiLibraryArchive.mock.calls[0] as [
      {
        children: Array<{ name: string }>;
        pads: Array<{ name: string }>;
        mediaChecksums: Record<string, { cutout: string }>;
      },
      { assertWriteAllowed: () => void },
    ];
    expect(imported.children).toEqual([expect.objectContaining({ name: "Ava" })]);
    expect(imported.pads).toEqual([expect.objectContaining({ name: "My Book" })]);
    expect(Object.values(imported.mediaChecksums)).toEqual([
      expect.objectContaining({ cutout: ARTWORK_CHECKSUM }),
    ]);
    expect(access.assertWriteAllowed).toEqual(expect.any(Function));
    expect(mockRequireExportAccess.mock.calls.map(([source]) => source)).toEqual([
      "archive_import",
      "archive_import_commit",
    ]);
    expect([...mockFileSystem.__directories]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("buki-import-")]),
    );
  });

  it("rejects corrupted media and removes extracted files", async () => {
    mockFileSystem.__files.set("mem://corrupt.buki", archiveBytes({
      manifestMedia: artworkBytes,
      storedMedia: strToU8("tampered-artwork-bytes"),
    }));

    await expect(importBukiArchive("mem://corrupt.buki")).rejects.toThrow(
      /size check failed|checksum check failed/,
    );

    expect(mockImportBukiLibraryArchive).not.toHaveBeenCalled();
    expect([...mockFileSystem.__files.keys()]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("buki-import-")]),
    );
  });

  it("removes copied media if Pro access expires at the import commit", async () => {
    mockFileSystem.__files.set("mem://expired.buki", archiveBytes());
    mockRequireExportAccess.mockImplementation((source: string) => {
      if (source === "archive_import_commit") throw new Error("Buki Pro is required");
    });

    await expect(importBukiArchive("mem://expired.buki")).rejects.toThrow(
      "Buki Pro is required",
    );

    expect(mockImportBukiLibraryArchive).toHaveBeenCalledTimes(1);
    expect([...mockFileSystem.__files.keys()]).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^mem:\/\/document\/(drawings|photos)\/import-/),
        expect.stringContaining("buki-import-"),
      ]),
    );
  });

  it("removes a partially created imported file when its copy throws", async () => {
    mockFileSystem.__files.set("mem://copy-failure.buki", archiveBytes());
    mockCopyFailureDestinationPrefix = "mem://document/drawings/import-";

    await expect(importBukiArchive("mem://copy-failure.buki")).rejects.toThrow(
      "Injected copy failure",
    );

    expect([...mockFileSystem.__files.keys()]).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^mem:\/\/document\/drawings\/import-/)]),
    );
    expect(mockImportBukiLibraryArchive).not.toHaveBeenCalled();
  });

  it("rejects unexpected archive entries before persistence", async () => {
    mockFileSystem.__files.set("mem://unexpected.buki", archiveBytes({
      extraEntries: { "media/artwork-999999/cutout.png": strToU8("not declared") },
    }));

    await expect(importBukiArchive("mem://unexpected.buki")).rejects.toThrow(
      "The archive contains an unexpected file: media/artwork-999999/cutout.png.",
    );
    expect(mockImportBukiLibraryArchive).not.toHaveBeenCalled();
  });

  it("uses a bounded extraction budget and requires free disk headroom", () => {
    expect(archiveExtractionBudget(1_024, 1024 * 1024 * 1024)).toBe(64 * 1024 * 1024);
    expect(() => archiveExtractionBudget(
      BUKI_ARCHIVE_LIMITS.maxExpandedBytes + 1,
      Number.MAX_SAFE_INTEGER,
    )).toThrow("too large");
    expect(() => archiveExtractionBudget(1_024, 128 * 1024 * 1024)).toThrow(
      "enough free space",
    );
  });
});
