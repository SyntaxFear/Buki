import { activeLocalOwnerId } from "./account-repository";
import { mergeImportedArchive, type ImportedArchiveLibrary } from "./archive-repository";
import { loadLibrary, saveLibrary } from "./library-repository";

jest.mock("./account-repository", () => ({
  activeLocalOwnerId: jest.fn(),
}));

jest.mock("./library-repository", () => ({
  loadLibrary: jest.fn(),
  saveLibrary: jest.fn(),
}));

const activeLocalOwnerIdMock = activeLocalOwnerId as jest.MockedFunction<typeof activeLocalOwnerId>;
const loadLibraryMock = loadLibrary as jest.MockedFunction<typeof loadLibrary>;
const saveLibraryMock = saveLibrary as jest.MockedFunction<typeof saveLibrary>;

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
    mediaChecksums: {},
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
  });

  it("rolls back imported profiles when Pro access is lost before the library commit", async () => {
    let allowed = true;
    let transaction = 0;
    const tx = { runAsync: jest.fn() };
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
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
      mergeImportedArchive(db as never, archiveWithTwentyOneArtworks(), assertImportAllowed),
    ).rejects.toThrow("Buki Pro is required");

    expect(saveLibraryMock).not.toHaveBeenCalled();
    expect(tx.runAsync).toHaveBeenCalledTimes(2);
    expect(tx.runAsync.mock.calls[0][0]).toContain("INSERT INTO child_profiles");
    expect(tx.runAsync.mock.calls[1][0]).toContain("DELETE FROM child_profiles");
  });
});
