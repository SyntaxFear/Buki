import { resolveCapabilities } from "@/subscription/access";
import { activeLocalOwnerId } from "./account-repository";
import {
  mergeImportedArchive,
  validateImportedArchiveLibrary,
  type ImportedArchiveLibrary,
} from "./archive-repository";
import { loadLibrary, saveLibrary } from "./library-repository";
import { enqueueCurrentChildProfile } from "./sync-serialization";

jest.mock("./account-repository", () => ({
  activeLocalOwnerId: jest.fn(),
}));

jest.mock("./library-repository", () => ({
  loadLibrary: jest.fn(),
  saveLibrary: jest.fn(),
}));

jest.mock("./sync-serialization", () => ({
  enqueueCurrentChildProfile: jest.fn(),
}));

const activeLocalOwnerIdMock = activeLocalOwnerId as jest.MockedFunction<typeof activeLocalOwnerId>;
const loadLibraryMock = loadLibrary as jest.MockedFunction<typeof loadLibrary>;
const saveLibraryMock = saveLibrary as jest.MockedFunction<typeof saveLibrary>;
const enqueueCurrentChildProfileMock = enqueueCurrentChildProfile as jest.MockedFunction<
  typeof enqueueCurrentChildProfile
>;

function archiveWithTwentyOneArtworks(): ImportedArchiveLibrary {
  const drawings = Array.from({ length: 21 }, (_, index) => ({
    id: `art-${index}`,
    uri: `file:///drawings/art-${index}.png`,
    width: 100,
    height: 100,
    rotation: 0,
    addedAt: index + 1,
  }));
  return {
    children: [{
      id: "child-imported",
      name: "Imported child",
      avatarColor: "#FFD65A",
      birthMonth: null,
      birthYear: null,
      createdAt: 1,
    }],
    pads: [{
      id: "pad-imported",
      childId: "child-imported",
      name: "Imported sketchpad",
      style: "spread",
      design: "sunshine",
      border: "none",
      decoration: "none",
      coverColor: "#FFD65A",
      pageColor: "#FFFDF4",
      createdAt: 1,
    }],
    drawingsByPad: { "pad-imported": drawings },
    mediaChecksums: Object.fromEntries(
      drawings.map((drawing, index) => [drawing.id, { cutout: index.toString(16).padStart(64, "0") }]),
    ),
  };
}

describe("Buki archive commit authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeLocalOwnerIdMock.mockResolvedValue("adult-a");
    loadLibraryMock.mockResolvedValue({
      version: 5,
      activePadId: "pad-current",
      pads: [],
      drawingsByPad: {},
    });
    saveLibraryMock.mockResolvedValue(undefined);
    enqueueCurrentChildProfileMock.mockResolvedValue(undefined);
  });

  it("rolls back imported profiles when Pro access is lost before the library commit", async () => {
    let allowed = true;
    let transaction = 0;
    const tx = { runAsync: jest.fn() };
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      withExclusiveTransactionAsync: jest.fn(
        async (operation: (transactionDatabase: typeof tx) => Promise<void>) => {
          transaction += 1;
          await operation(tx);
          if (transaction === 1) allowed = false;
        },
      ),
    };
    const assertImportAllowed = () => {
      if (!allowed) throw new Error("Buki Pro is required to use library archives.");
    };

    await expect(
      mergeImportedArchive(db as never, archiveWithTwentyOneArtworks(), {
        getCapabilities: () => resolveCapabilities("pro"),
        assertWriteAllowed: assertImportAllowed,
      }),
    ).rejects.toThrow("Buki Pro is required");

    expect(saveLibraryMock).not.toHaveBeenCalled();
    expect(tx.runAsync).toHaveBeenCalledTimes(3);
    expect(tx.runAsync.mock.calls[0][0]).toContain("INSERT INTO child_profiles");
    expect(tx.runAsync.mock.calls[1][0]).toContain("DELETE FROM sync_queue");
    expect(tx.runAsync.mock.calls[2][0]).toContain("DELETE FROM child_profiles");
  });

  it("rejects malformed import graphs before touching SQLite", () => {
    const imported = archiveWithTwentyOneArtworks();
    imported.pads[0] = { ...imported.pads[0], childId: "unknown-child" };

    expect(() => validateImportedArchiveLibrary(imported)).toThrow(
      "does not belong to an imported child",
    );
  });

  it("rejects duplicate imported content before touching SQLite", () => {
    const imported = archiveWithTwentyOneArtworks();
    imported.mediaChecksums["art-1"] = imported.mediaChecksums["art-0"];

    expect(() => validateImportedArchiveLibrary(imported)).toThrow(
      "duplicate artwork content",
    );
  });

  it("rejects local ID collisions without deleting existing records", async () => {
    const tx = { runAsync: jest.fn() };
    const db = {
      getAllAsync: jest.fn().mockResolvedValueOnce([{ id: "child-imported" }]),
      getFirstAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(
        async (operation: (transactionDatabase: typeof tx) => Promise<void>) => operation(tx),
      ),
    };

    await expect(
      mergeImportedArchive(db as never, archiveWithTwentyOneArtworks(), {
        getCapabilities: () => resolveCapabilities("pro"),
        assertWriteAllowed: jest.fn(),
      }),
    ).rejects.toThrow("conflicts with existing local record IDs");

    expect(tx.runAsync).not.toHaveBeenCalled();
    expect(saveLibraryMock).not.toHaveBeenCalled();
  });

  it("does not clean up rows when authorization fails before the child transaction", async () => {
    const tx = { runAsync: jest.fn() };
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
      withExclusiveTransactionAsync: jest.fn(
        async (operation: (transactionDatabase: typeof tx) => Promise<void>) => operation(tx),
      ),
    };

    await expect(
      mergeImportedArchive(db as never, archiveWithTwentyOneArtworks(), {
        getCapabilities: () => resolveCapabilities("pro"),
        assertWriteAllowed: jest.fn(() => {
          throw new Error("Buki Pro is required");
        }),
      }),
    ).rejects.toThrow("Buki Pro is required");

    expect(tx.runAsync).not.toHaveBeenCalled();
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(0);
    expect(saveLibraryMock).not.toHaveBeenCalled();
  });

  it("commits imported checksums with the library snapshot", async () => {
    const tx = { runAsync: jest.fn(), getFirstAsync: jest.fn() };
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
      withExclusiveTransactionAsync: jest.fn(
        async (operation: (transactionDatabase: typeof tx) => Promise<void>) => operation(tx),
      ),
    };
    const imported = archiveWithTwentyOneArtworks();

    await mergeImportedArchive(db as never, imported, {
      getCapabilities: () => resolveCapabilities("pro"),
      assertWriteAllowed: jest.fn(),
    });

    expect(enqueueCurrentChildProfileMock).toHaveBeenCalledWith(
      tx,
      "adult-a",
      "child-imported",
    );
    expect(saveLibraryMock).toHaveBeenCalledWith(
      db,
      expect.any(Object),
      expect.any(Object),
      {
        mediaChecksums: imported.mediaChecksums,
        expectedOwnerId: "adult-a",
      },
    );
  });
});
