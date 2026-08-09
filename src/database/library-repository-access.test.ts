import {
  ContentLimitReachedError,
  ProFeatureRequiredError,
  resolveCapabilities,
} from "@/subscription/access";
import type { Drawing, StoreData } from "@/store/migrate";
import { activeLocalOwnerId } from "./account-repository";
import {
  assertLibrarySnapshotWithinCapabilities,
  saveLibrary,
} from "./library-repository";

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly exists = true;
    readonly size = 1;
  },
}));

jest.mock("./account-repository", () => ({
  activeLocalOwnerId: jest.fn(),
  activePadPreferenceKey: jest.fn(() => "active-pad"),
}));

const activeLocalOwnerIdMock = activeLocalOwnerId as jest.MockedFunction<typeof activeLocalOwnerId>;

function drawing(index: number): Drawing {
  return {
    id: `art-${index}`,
    uri: `file:///art-${index}.png`,
    width: 100,
    height: 100,
    rotation: 0,
    addedAt: index + 1,
  };
}

function library(artworks: number, padId = "pad-a"): StoreData {
  return {
    version: 5,
    activePadId: padId,
    pads: [{
      id: padId,
      childId: "child-a",
      name: "My Book",
      style: "spread",
      design: "sunshine",
      border: "none",
      decoration: "none",
      coverColor: "#FFD65A",
      pageColor: "#FFFDF4",
      createdAt: 1,
    }],
    drawingsByPad: {
      [padId]: Array.from({ length: artworks }, (_, index) => drawing(index)),
    },
  };
}

type ExistingPad = string | {
  id: string;
  design: string;
  border: string;
  decoration: string;
};

function database(existingPads: ExistingPad[] = [], existingArtworks: string[] = []) {
  const tx = {
    getAllAsync: jest
      .fn()
      .mockResolvedValueOnce(existingPads.map((pad) =>
        typeof pad === "string"
          ? { id: pad, design: "sunshine", border: "none", decoration: "none" }
          : pad,
      ))
      .mockResolvedValueOnce(existingArtworks.map((id) => ({ id }))),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn(),
  };
  const db = {
    withExclusiveTransactionAsync: jest.fn(
      async (operation: (transactionDatabase: typeof tx) => Promise<void>) => operation(tx),
    ),
  };
  return { db, tx };
}

describe("library repository capability boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeLocalOwnerIdMock.mockResolvedValue(null);
  });

  it("blocks a direct Free snapshot containing a twenty-first artwork before writes", async () => {
    const { db, tx } = database();

    await expect(
      saveLibrary(db as never, library(21), {
        getCapabilities: () => resolveCapabilities("free"),
      }),
    ).rejects.toEqual(new ContentLimitReachedError("artworks"));

    expect(tx.runAsync).not.toHaveBeenCalled();
  });

  it("blocks a direct Free snapshot containing a second sketchpad", () => {
    const data = library(0);
    const secondPad = { ...data.pads[0], id: "pad-b", name: "Second" };
    expect(() => assertLibrarySnapshotWithinCapabilities(
      { sketchpads: new Set(["pad-a"]), artworks: new Set() },
      {
        ...data,
        pads: [...data.pads, secondPad],
        drawingsByPad: { ...data.drawingsByPad, "pad-b": [] },
      },
      resolveCapabilities("free"),
    )).toThrow(new ContentLimitReachedError("sketchpads"));
  });

  it("preserves an over-limit migrated library when the snapshot adds no IDs", () => {
    const data = library(27);
    expect(() => assertLibrarySnapshotWithinCapabilities(
      {
        sketchpads: new Set(["pad-a"]),
        artworks: new Set(data.drawingsByPad["pad-a"].map((item) => item.id)),
      },
      data,
      resolveCapabilities("free"),
    )).not.toThrow();
  });

  it("allows Pro snapshots above Free limits", () => {
    expect(() => assertLibrarySnapshotWithinCapabilities(
      { sketchpads: new Set(), artworks: new Set() },
      library(21),
      resolveCapabilities("pro"),
    )).not.toThrow();
  });

  it("blocks a direct Free snapshot that changes an existing pad to premium visuals", () => {
    const data = library(0);
    data.pads[0] = {
      ...data.pads[0],
      design: "moonlight",
      border: "museum-frame",
      decoration: "starry-sky",
    };

    expect(() => assertLibrarySnapshotWithinCapabilities(
      {
        sketchpads: new Set(["pad-a"]),
        artworks: new Set(),
        padVisuals: new Map([[
          "pad-a",
          { design: "sunshine", border: "none", decoration: "none" },
        ]]),
      },
      data,
      resolveCapabilities("free"),
    )).toThrow(new ProFeatureRequiredError("premiumVisuals"));
  });

  it("preserves unchanged premium styling after Pro expires", () => {
    const data = library(0);
    data.pads[0] = {
      ...data.pads[0],
      style: "grid",
      design: "moonlight",
      border: "museum-frame",
      decoration: "starry-sky",
    };

    expect(() => assertLibrarySnapshotWithinCapabilities(
      {
        sketchpads: new Set(["pad-a"]),
        artworks: new Set(),
        padVisuals: new Map([[
          "pad-a",
          { design: "moonlight", border: "museum-frame", decoration: "starry-sky" },
        ]]),
      },
      data,
      resolveCapabilities("free"),
    )).not.toThrow();
  });

  it.each(["spread", "vertical", "album", "grid", "strip"] as const)(
    "keeps the %s layout available to Free users",
    (style) => {
      const data = library(0);
      data.pads[0] = { ...data.pads[0], style };

      expect(() => assertLibrarySnapshotWithinCapabilities(
        {
          sketchpads: new Set(["pad-a"]),
          artworks: new Set(),
          padVisuals: new Map([[
            "pad-a",
            { design: "sunshine", border: "none", decoration: "none" },
          ]]),
        },
        data,
        resolveCapabilities("free"),
      )).not.toThrow();
    },
  );

  it("rechecks authorization after writes so the transaction can roll back", async () => {
    let allowed = true;
    const { db, tx } = database();
    tx.runAsync.mockImplementation(async () => {
      allowed = false;
      return undefined as never;
    });
    const empty: StoreData = {
      version: 5,
      activePadId: "",
      pads: [],
      drawingsByPad: {},
    };
    const assertWriteAllowed = jest.fn(() => {
      if (!allowed) throw new Error("Buki Pro is required to use library archives.");
    });

    await expect(
      saveLibrary(db as never, empty, {
        getCapabilities: () => resolveCapabilities("pro"),
        assertWriteAllowed,
      }),
    ).rejects.toThrow("Buki Pro is required");

    expect(tx.runAsync).toHaveBeenCalled();
    expect(assertWriteAllowed).toHaveBeenCalledTimes(2);
  });

  it("rolls back a normal twenty-first artwork when Pro expires during the write", async () => {
    let pro = true;
    const { db, tx } = database();
    tx.runAsync.mockImplementation(async () => {
      pro = false;
      return undefined as never;
    });

    await expect(
      saveLibrary(db as never, library(21), {
        getCapabilities: () => resolveCapabilities(pro ? "pro" : "free"),
      }),
    ).rejects.toEqual(new ContentLimitReachedError("artworks"));

    expect(tx.runAsync).toHaveBeenCalled();
  });

  it("rolls back a premium visual change when Pro expires during the write", async () => {
    let pro = true;
    const { db, tx } = database([{
      id: "pad-a",
      design: "sunshine",
      border: "none",
      decoration: "none",
    }]);
    tx.runAsync.mockImplementation(async () => {
      pro = false;
      return undefined as never;
    });
    const data = library(0);
    data.pads[0] = {
      ...data.pads[0],
      design: "moonlight",
      border: "museum-frame",
      decoration: "starry-sky",
    };

    await expect(
      saveLibrary(db as never, data, {
        getCapabilities: () => resolveCapabilities(pro ? "pro" : "free"),
      }),
    ).rejects.toEqual(new ProFeatureRequiredError("premiumVisuals"));

    expect(tx.runAsync).toHaveBeenCalled();
  });
});
