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

type ExistingArtwork = string | {
  id: string;
  padId?: string;
  favorite?: boolean;
  tags?: string[];
};

function database(existingPads: ExistingPad[] = [], existingArtworks: ExistingArtwork[] = []) {
  const artworkRows = existingArtworks.map((artwork) =>
    typeof artwork === "string"
      ? { id: artwork, sketchpad_id: "pad-a", favorite: 0 }
      : {
          id: artwork.id,
          sketchpad_id: artwork.padId ?? "pad-a",
          favorite: artwork.favorite ? 1 : 0,
        },
  );
  const tagRows = existingArtworks.flatMap((artwork) =>
    typeof artwork === "string"
      ? []
      : (artwork.tags ?? []).map((name) => ({ artwork_id: artwork.id, name })),
  );
  const tx = {
    getAllAsync: jest
      .fn()
      .mockResolvedValueOnce(existingPads.map((pad) =>
        typeof pad === "string"
          ? { id: pad, design: "sunshine", border: "none", decoration: "none" }
          : pad,
      ))
      .mockResolvedValueOnce(artworkRows)
      .mockResolvedValueOnce(tagRows),
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

  it("blocks direct Free favorite, tag, and move changes", () => {
    const data = library(1);
    data.drawingsByPad["pad-a"][0] = {
      ...data.drawingsByPad["pad-a"][0],
      favorite: true,
      tags: ["School"],
    };

    expect(() => assertLibrarySnapshotWithinCapabilities(
      {
        sketchpads: new Set(["pad-a"]),
        artworks: new Set(["art-0"]),
        artworkOrganization: new Map([[
          "art-0",
          { padId: "pad-a", favorite: false, tags: [] },
        ]]),
      },
      data,
      resolveCapabilities("free"),
    )).toThrow(new ProFeatureRequiredError("advancedOrganization"));

    const secondPad = { ...data.pads[0], id: "pad-b", name: "Second" };
    const moved = {
      ...data,
      pads: [data.pads[0], secondPad],
      drawingsByPad: {
        "pad-a": [],
        "pad-b": [{ ...data.drawingsByPad["pad-a"][0], favorite: false, tags: [] }],
      },
    };
    expect(() => assertLibrarySnapshotWithinCapabilities(
      {
        sketchpads: new Set(["pad-a", "pad-b"]),
        artworks: new Set(["art-0"]),
        artworkOrganization: new Map([[
          "art-0",
          { padId: "pad-a", favorite: false, tags: [] },
        ]]),
      },
      moved,
      resolveCapabilities("free"),
    )).toThrow(new ProFeatureRequiredError("advancedOrganization"));
  });

  it("preserves unchanged organization metadata after Pro expires", () => {
    const data = library(1);
    data.drawingsByPad["pad-a"][0] = {
      ...data.drawingsByPad["pad-a"][0],
      title: "Updated basic title",
      favorite: true,
      tags: ["School", "Space"],
    };

    expect(() => assertLibrarySnapshotWithinCapabilities(
      {
        sketchpads: new Set(["pad-a"]),
        artworks: new Set(["art-0"]),
        artworkOrganization: new Map([[
          "art-0",
          { padId: "pad-a", favorite: true, tags: ["space", "school"] },
        ]]),
      },
      data,
      resolveCapabilities("free"),
    )).not.toThrow();
  });

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

  it("rolls back organization changes when Pro expires during the write", async () => {
    let pro = true;
    const { db, tx } = database(["pad-a"], [{
      id: "art-0",
      favorite: false,
      tags: [],
    }]);
    tx.runAsync.mockImplementation(async () => {
      pro = false;
      return undefined as never;
    });
    const data = library(1);
    data.drawingsByPad["pad-a"][0] = {
      ...data.drawingsByPad["pad-a"][0],
      favorite: true,
      tags: ["School"],
    };

    await expect(
      saveLibrary(db as never, data, {
        getCapabilities: () => resolveCapabilities(pro ? "pro" : "free"),
      }),
    ).rejects.toEqual(new ProFeatureRequiredError("advancedOrganization"));

    expect(tx.runAsync).toHaveBeenCalled();
  });
});
