jest.mock("expo-file-system", () => ({ File: class MockFile {} }));

import {
  padIdFromViewedUnitPreferenceKey,
  viewedUnitPreferenceKey,
} from "./account-repository";
import {
  getSketchpadViewedUnits,
  setSketchpadViewedUnit,
} from "./settings-repository";

describe("sketchpad viewed-unit preferences", () => {
  it("round-trips arbitrary sketchpad identifiers without crossing account scopes", () => {
    const key = viewedUnitPreferenceKey("adult-a", "pad:summer/100%");

    expect(padIdFromViewedUnitPreferenceKey(key, "adult-a")).toBe(
      "pad:summer/100%",
    );
    expect(padIdFromViewedUnitPreferenceKey(key, "adult-b")).toBeNull();
  });

  it("loads only valid page positions for the active account", async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ value: "adult-a" }),
      getAllAsync: jest.fn().mockResolvedValue([
        { key: viewedUnitPreferenceKey("adult-a", "pad-a"), value: "4" },
        { key: viewedUnitPreferenceKey("adult-b", "pad-b"), value: "7" },
        { key: viewedUnitPreferenceKey("adult-a", "pad-c"), value: "-1" },
        { key: viewedUnitPreferenceKey("adult-a", "pad-d"), value: "nope" },
      ]),
    };

    await expect(getSketchpadViewedUnits(db as never)).resolves.toEqual({
      "pad-a": 4,
    });
  });

  it("persists a page only when the sketchpad belongs to the active account", async () => {
    const db = {
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce({ value: "adult-a" })
        .mockResolvedValueOnce({ id: "pad-a" }),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };

    await setSketchpadViewedUnit(db as never, "pad-a", 5);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO preferences"),
      viewedUnitPreferenceKey("adult-a", "pad-a"),
      "5",
      expect.any(Number),
    );
  });

  it("does not persist a stale sketchpad after an account switch", async () => {
    const db = {
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce({ value: "adult-b" })
        .mockResolvedValueOnce(null),
      runAsync: jest.fn(),
    };

    await setSketchpadViewedUnit(db as never, "pad-from-adult-a", 2);

    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
