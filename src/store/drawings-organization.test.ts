const mockPersist = jest.fn();
const mockRequestUpgrade = jest.fn();
const mockDeletedFiles: string[] = [];
let mockCapabilities: import("@/subscription/access").Capabilities;

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get exists() {
      return true;
    }

    delete() {
      mockDeletedFiles.push(this.uri);
    }
  },
}));

jest.mock("@/database", () => ({
  enqueueLibrarySnapshot: (...args: unknown[]) => mockPersist(...args),
  enqueueSketchpadViewedUnit: jest.fn(),
  loadLibrarySnapshot: jest.fn(),
  loadSketchpadViewedUnits: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/store/membership", () => ({
  currentCapabilities: () => mockCapabilities,
  useMembership: {
    getState: () => ({
      ownerId: "adult-a",
      loading: false,
      tier: "pro",
      requestUpgrade: mockRequestUpgrade,
    }),
  },
}));

jest.mock("@/store/preferences", () => ({
  usePreferences: {
    getState: () => ({
      proIntroductionShown: true,
      markProIntroductionShown: jest.fn(),
    }),
  },
}));

import { ProFeatureRequiredError, resolveCapabilities } from "@/subscription/access";
import type { Drawing, Sketchpad } from "./migrate";
import {
  activeChildPadIdsOf,
  rollbackRejectedAdvancedOrganization,
  useDrawings,
} from "./drawings";

const padA: Sketchpad = {
  id: "pad-a",
  childId: "child-a",
  name: "A",
  style: "spread",
  design: "sunshine",
  border: "none",
  decoration: "none",
  coverColor: "#111111",
  createdAt: 1,
};

const padA2: Sketchpad = { ...padA, id: "pad-a-2", name: "A2", createdAt: 2 };
const padB: Sketchpad = {
  ...padA,
  id: "pad-b",
  childId: "child-b",
  name: "B",
  createdAt: 3,
};

function drawing(id: string): Drawing {
  return {
    id,
    uri: `file:///${id}.png`,
    width: 100,
    height: 100,
    rotation: 0,
    addedAt: 1,
    favorite: false,
    tags: [],
  };
}

describe("artwork organization child scoping", () => {
  beforeEach(() => {
    mockPersist.mockReset();
    mockRequestUpgrade.mockReset();
    mockDeletedFiles.length = 0;
    mockCapabilities = resolveCapabilities("pro");
    useDrawings.setState({
      hydrated: true,
      pads: [padA, padA2, padB],
      activePadId: padA.id,
      drawingsByPad: {
        [padA.id]: [drawing("art-a")],
        [padA2.id]: [],
        [padB.id]: [drawing("art-b")],
      },
      pending: null,
    });
  });

  it("identifies only the active child's sketchpads", () => {
    expect([...activeChildPadIdsOf(useDrawings.getState())]).toEqual([padA.id, padA2.id]);
  });

  it("blocks direct individual mutations for another child", () => {
    const state = useDrawings.getState();

    expect(state.updateDrawingMetadata("art-b", { title: "Hidden", notes: "Hidden" })).toBe(false);
    expect(state.toggleDrawingFavorite("art-b")).toBe(false);
    expect(state.setDrawingTags("art-b", ["Hidden"])).toBe(false);
    expect(state.deleteDrawing("art-b")).toBe(false);

    expect(useDrawings.getState().drawingsByPad[padB.id]).toEqual([drawing("art-b")]);
    expect(mockDeletedFiles).toEqual([]);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("limits bulk favorite and tag changes to the active child", () => {
    expect(useDrawings.getState().bulkSetFavorite(["art-a", "art-b"], true)).toBe(true);
    expect(useDrawings.getState().bulkAddTag(["art-a", "art-b"], "School")).toBe(true);

    expect(useDrawings.getState().drawingsByPad[padA.id][0]).toMatchObject({
      favorite: true,
      tags: ["School"],
    });
    expect(useDrawings.getState().drawingsByPad[padB.id][0]).toMatchObject({
      favorite: false,
      tags: [],
    });
  });

  it("rejects cross-child moves and deletes only active-child selections", () => {
    expect(useDrawings.getState().bulkMoveDrawings(["art-a"], padB.id)).toBe(false);
    expect(useDrawings.getState().bulkDeleteDrawings(["art-a", "art-b"])).toBe(true);

    expect(useDrawings.getState().drawingsByPad[padA.id]).toEqual([]);
    expect(useDrawings.getState().drawingsByPad[padB.id]).toEqual([drawing("art-b")]);
    expect(mockDeletedFiles).toEqual(["file:///art-a.png"]);
  });

  it("rolls back an optimistic favorite if Pro expires during persistence", () => {
    mockPersist.mockImplementation((...args: unknown[]) => {
      const onError = args[2] as ((error: unknown) => void) | undefined;
      onError?.(new ProFeatureRequiredError("advancedOrganization"));
    });

    expect(useDrawings.getState().toggleDrawingFavorite("art-a")).toBe(true);

    expect(useDrawings.getState().drawingsByPad[padA.id][0].favorite).toBe(false);
    expect(mockRequestUpgrade).toHaveBeenCalledWith(
      "advancedOrganization",
      "artwork_favorite_commit",
    );
  });

  it("rolls back an optimistic tag if Pro expires during persistence", () => {
    mockPersist.mockImplementation((...args: unknown[]) => {
      const onError = args[2] as ((error: unknown) => void) | undefined;
      onError?.(new ProFeatureRequiredError("advancedOrganization"));
    });

    expect(useDrawings.getState().setDrawingTags("art-a", ["School"])).toBe(true);

    expect(useDrawings.getState().drawingsByPad[padA.id][0].tags).toEqual([]);
    expect(mockRequestUpgrade).toHaveBeenCalledWith(
      "advancedOrganization",
      "artwork_tags_commit",
    );
  });

  it("restores multiple moved drawings in their original order", () => {
    const first = drawing("first");
    const second = drawing("second");
    const third = drawing("third");
    const previous = {
      [padA.id]: [first, second, third],
      [padA2.id]: [],
    };
    const movedAt = 20;
    const rejected = {
      [padA.id]: [third],
      [padA2.id]: [
        { ...first, updatedAt: movedAt },
        { ...second, updatedAt: movedAt },
      ],
    };

    expect(rollbackRejectedAdvancedOrganization(rejected, previous, rejected)).toEqual(previous);
  });

  it("rolls back an optimistic bulk move if Pro expires during persistence", () => {
    mockPersist.mockImplementation((...args: unknown[]) => {
      const onError = args[2] as ((error: unknown) => void) | undefined;
      onError?.(new ProFeatureRequiredError("advancedOrganization"));
    });

    expect(useDrawings.getState().bulkMoveDrawings(["art-a"], padA2.id)).toBe(true);

    expect(useDrawings.getState().drawingsByPad[padA.id]).toEqual([drawing("art-a")]);
    expect(useDrawings.getState().drawingsByPad[padA2.id]).toEqual([]);
    expect(mockRequestUpgrade).toHaveBeenCalledWith(
      "advancedOrganization",
      "library_bulk_move_commit",
    );
  });
});
