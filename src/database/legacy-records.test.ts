import { buildLegacyMigrationRecords } from "./legacy-records";
import type { StoreData } from "@/store/migrate";

const legacy: StoreData = {
  version: 3,
  activePadId: "pad-a",
  pads: [
    {
      id: "pad-a",
      childId: "child-default",
      name: "First",
      style: "spread",
      design: "berry",
      coverColor: "#D86485",
      pageColor: "#FFF8F5",
      createdAt: 100,
    },
  ],
  drawingsByPad: {
    "pad-a": [
      {
        id: "art-1",
        uri: "file:///cutout.png",
        photoUri: "file:///photo.jpg",
        width: 320,
        height: 240,
        rotation: -4.5,
        addedAt: 200,
      },
    ],
  },
};

describe("legacy SQLite migration records", () => {
  it("preserves IDs, geometry, dates, styling, and child assignment", () => {
    const records = buildLegacyMigrationRecords(legacy, () => true);
    expect(records.sketchpads[0]).toMatchObject({
      id: "pad-a",
      childId: "child-default",
      style: "spread",
      design: "berry",
      createdAt: 100,
    });
    expect(records.artworks[0]).toMatchObject({
      id: "art-1",
      sketchpadId: "pad-a",
      width: 320,
      height: 240,
      rotation: -4.5,
      addedAt: 200,
      mediaMissing: false,
    });
  });

  it("keeps artwork metadata when its source image is missing", () => {
    const records = buildLegacyMigrationRecords(legacy, () => false);
    expect(records.artworks).toHaveLength(1);
    expect(records.artworks[0].mediaMissing).toBe(true);
  });

  it("preserves an over-limit library without truncation", () => {
    const drawings = Array.from({ length: 27 }, (_, index) => ({
      ...legacy.drawingsByPad["pad-a"][0],
      id: `art-${index}`,
      uri: `file:///cutout-${index}.png`,
    }));
    const records = buildLegacyMigrationRecords(
      { ...legacy, drawingsByPad: { "pad-a": drawings } },
      () => true,
    );
    expect(records.artworks).toHaveLength(27);
  });
});
