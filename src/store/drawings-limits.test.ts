const mockDeletedFiles: string[] = [];
const mockRequestUpgrade = jest.fn();
const mockPersist = jest.fn();
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
  loadLibrarySnapshot: jest.fn(),
}));

jest.mock("@/store/membership", () => ({
  currentCapabilities: () => mockCapabilities,
  useMembership: {
    getState: () => ({
      ownerId: "adult-a",
      loading: false,
      tier: "free",
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

import {
  ContentLimitReachedError,
  ProFeatureRequiredError,
  resolveCapabilities,
} from "@/subscription/access";
import type { Drawing, Sketchpad } from "./migrate";
import { useDrawings } from "./drawings";

const pad: Sketchpad = {
  id: "pad-a",
  childId: "child-a",
  name: "My Book",
  style: "spread",
  design: "sunshine",
  border: "none",
  decoration: "none",
  coverColor: "#FFE27A",
  pageColor: "#FFF9E8",
  createdAt: 1,
};

function drawing(index: number): Drawing {
  return {
    id: `drawing-${index}`,
    uri: `file:///saved-${index}.png`,
    width: 100,
    height: 100,
    rotation: 0,
    addedAt: index,
  };
}

describe("artwork limit mutations", () => {
  beforeEach(() => {
    mockDeletedFiles.length = 0;
    mockRequestUpgrade.mockReset();
    mockPersist.mockReset();
    mockCapabilities = resolveCapabilities("free");
    useDrawings.setState({
      hydrated: true,
      pads: [pad],
      activePadId: pad.id,
      drawingsByPad: { [pad.id]: Array.from({ length: 20 }, (_, index) => drawing(index)) },
      pending: {
        uri: "file:///pending-cutout.png",
        photoUri: "file:///pending-photo.jpg",
        width: 100,
        height: 100,
        rotation: 0,
        inkBox: { x: 0, y: 0, w: 100, h: 100 },
        paperBox: { x: 0, y: 0, w: 100, h: 100 },
        sourceWidth: 100,
        sourceHeight: 100,
      },
    });
  });

  it("removes pending media when the Free artwork limit blocks a commit", () => {
    expect(useDrawings.getState().commitPending()).toBe(false);

    expect(useDrawings.getState().pending).toBeNull();
    expect(mockDeletedFiles).toEqual([
      "file:///pending-cutout.png",
      "file:///pending-photo.jpg",
    ]);
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockRequestUpgrade).toHaveBeenCalledWith("artworks", "artwork_limit");
  });

  it("preflights the global Free limit before capture or import", () => {
    expect(useDrawings.getState().requestArtworkCreation("artwork_limit")).toBe(false);
    expect(mockRequestUpgrade).toHaveBeenCalledWith("artworks", "artwork_limit");

    useDrawings.setState({ drawingsByPad: { [pad.id]: Array.from({ length: 19 }, (_, index) => drawing(index)) } });
    mockRequestUpgrade.mockClear();
    expect(useDrawings.getState().requestArtworkCreation("artwork_limit")).toBe(true);
    expect(mockRequestUpgrade).not.toHaveBeenCalled();
  });

  it("allows Pro artwork creation above the Free limit", () => {
    mockCapabilities = resolveCapabilities("pro");
    expect(useDrawings.getState().requestArtworkCreation("artwork_limit")).toBe(true);
    expect(mockRequestUpgrade).not.toHaveBeenCalled();
  });

  it("removes a new artwork when the database rejects an expiry race", () => {
    mockCapabilities = resolveCapabilities("pro");
    mockPersist.mockImplementationOnce(
      (_data: unknown, _getCapabilities: unknown, onError: (error: unknown) => void) => {
        mockCapabilities = resolveCapabilities("free");
        onError(new ContentLimitReachedError("artworks"));
      },
    );

    expect(useDrawings.getState().commitPending()).toBe(true);
    expect(useDrawings.getState().drawingsByPad[pad.id]).toHaveLength(20);
    expect(mockDeletedFiles).toEqual([
      "file:///pending-cutout.png",
      "file:///pending-photo.jpg",
    ]);
    expect(mockRequestUpgrade).toHaveBeenCalledWith("artworks", "artwork_limit_commit");
  });

  it("removes a new sketchpad when the database rejects an expiry race", () => {
    mockCapabilities = resolveCapabilities("pro");
    mockPersist.mockImplementationOnce(
      (_data: unknown, _getCapabilities: unknown, onError: (error: unknown) => void) => {
        mockCapabilities = resolveCapabilities("free");
        onError(new ContentLimitReachedError("sketchpads"));
      },
    );

    const created = useDrawings.getState().createPad(
      "Second",
      "spread",
      "sunshine",
      undefined,
      "child-a",
    );

    expect(created).not.toBeNull();
    expect(useDrawings.getState().pads).toEqual([pad]);
    expect(useDrawings.getState().activePadId).toBe(pad.id);
    expect(mockRequestUpgrade).toHaveBeenCalledWith("sketchpads", "sketchpad_limit_commit");
  });

  it.each(["spread", "vertical", "album", "grid", "strip"] as const)(
    "lets Free users switch their existing sketchpad to the %s layout",
    (style) => {
      expect(useDrawings.getState().setPadVisuals(pad.id, {
        style,
        design: "sunshine",
        border: "none",
        decoration: "none",
        pageColor: pad.pageColor,
      })).toBe(true);

      expect(useDrawings.getState().pads[0].style).toBe(style);
      expect(mockRequestUpgrade).not.toHaveBeenCalled();
    },
  );

  it("blocks a new premium look without changing the saved Free pad", () => {
    expect(useDrawings.getState().setPadVisuals(pad.id, {
      style: "grid",
      design: "moonlight",
      border: "museum-frame",
      decoration: "starry-sky",
    })).toBe(false);

    expect(useDrawings.getState().pads).toEqual([pad]);
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockRequestUpgrade).toHaveBeenCalledWith("premiumVisuals", "premium_visual_save");
  });

  it("rolls back a premium look when Pro expires during the database write", () => {
    mockCapabilities = resolveCapabilities("pro");
    mockPersist.mockImplementationOnce(
      (_data: unknown, _getCapabilities: unknown, onError: (error: unknown) => void) => {
        mockCapabilities = resolveCapabilities("free");
        onError(new ProFeatureRequiredError("premiumVisuals"));
      },
    );

    expect(useDrawings.getState().setPadVisuals(pad.id, {
      style: "album",
      design: "moonlight",
      border: "museum-frame",
      decoration: "starry-sky",
    })).toBe(true);

    expect(useDrawings.getState().pads).toEqual([pad]);
    expect(mockRequestUpgrade).toHaveBeenCalledWith(
      "premiumVisuals",
      "premium_visual_save_commit",
    );
  });
});
