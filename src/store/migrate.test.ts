import { migrateStoreData } from "./migrate";
import {
  drawingHitTest,
  getBookLayout,
  getPadPageLayout,
  sideForIndex,
  slotIndexForIndex,
  unitCapacity,
  unitCount,
  unitForIndex,
} from "@/utils/book-layout";

const NOW = 1_700_000_000_000;

const drawing = (n: number) => ({
  id: `d-${n}`,
  uri: `file:///drawings/${n}.png`,
  width: 100,
  height: 80,
  rotation: 2,
  addedAt: NOW,
});

describe("migrateStoreData", () => {
  it("wraps a v1 store into a single default vertical pad", () => {
    const v1 = { version: 1, drawings: [drawing(1), drawing(2)] };
    const out = migrateStoreData(v1, NOW);
    expect(out.version).toBe(5);
    expect(out.pads).toHaveLength(1);
    expect(out.pads[0].style).toBe("vertical");
    expect(out.pads[0].name).toBe("My Book");
    expect(out.pads[0].childId).toBe("child-default");
    expect(out.pads[0].design).toBe("sunshine");
    expect(out.pads[0].border).toBe("none");
    expect(out.pads[0].decoration).toBe("none");
    expect(out.pads[0].icon).toBe("cover");
    expect(out.activePadId).toBe(out.pads[0].id);
    expect(out.drawingsByPad[out.pads[0].id]).toHaveLength(2);
  });

  it("migrates a valid v2 store, infers designs, and keeps the active pad", () => {
    const v2 = {
      version: 2,
      activePadId: "p2",
      pads: [
        { id: "p1", name: "A", style: "spread", coverColor: "#E8695A", createdAt: NOW },
        { id: "p2", name: "B", style: "vertical", coverColor: "#5EC6B4", createdAt: NOW },
      ],
      drawingsByPad: { p1: [drawing(1)], p2: [drawing(2), drawing(3)] },
    };
    const out = migrateStoreData(v2, NOW);
    expect(out.version).toBe(5);
    expect(out.pads).toHaveLength(2);
    expect(out.activePadId).toBe("p2");
    expect(out.pads[0].design).toBe("berry");
    expect(out.pads[1].design).toBe("garden");
    expect(out.drawingsByPad.p1).toHaveLength(1);
    expect(out.drawingsByPad.p2).toHaveLength(2);
  });

  it("repairs a v2 store whose active pad is missing", () => {
    const v2 = {
      version: 2,
      activePadId: "ghost",
      pads: [{ id: "p1", name: "A", style: "spread", coverColor: "#E8695A", createdAt: NOW }],
      drawingsByPad: {},
    };
    const out = migrateStoreData(v2, NOW);
    expect(out.activePadId).toBe("p1");
    expect(out.drawingsByPad.p1).toEqual([]);
  });

  it("drops malformed drawings and pads", () => {
    const v2 = {
      version: 2,
      activePadId: "p1",
      pads: [
        { id: "p1", name: "A", style: "spread", coverColor: "#E8695A", createdAt: NOW },
        { id: "p2", name: "bad", style: "diagonal", coverColor: "#000", createdAt: NOW },
      ],
      drawingsByPad: { p1: [drawing(1), { junk: true }, null] },
    };
    const out = migrateStoreData(v2, NOW);
    expect(out.pads).toHaveLength(1);
    expect(out.drawingsByPad.p1).toHaveLength(1);
  });

  it("preserves a v3 design choice and artwork metadata", () => {
    const v3 = {
      version: 3,
      activePadId: "p1",
      pads: [
        {
          id: "p1",
          name: "Sky pad",
          style: "vertical",
          design: "sky",
          coverColor: "#769CE3",
          pageColor: "#F8FCFF",
          createdAt: NOW,
        },
      ],
      drawingsByPad: {
        p1: [
          {
            ...drawing(1),
            title: "Night sky",
            notes: "First telescope drawing",
            favorite: true,
            tags: [" Space ", "space", "Night"],
            updatedAt: NOW + 5,
          },
        ],
      },
    };
    const out = migrateStoreData(v3, NOW);
    expect(out.version).toBe(5);
    expect(out.pads[0].design).toBe("sky");
    expect(out.pads[0].childId).toBe("child-default");
    expect(out.pads[0].pageColor).toBe("#F8FCFF");
    expect(out.pads[0].border).toBe("none");
    expect(out.pads[0].decoration).toBe("none");
    expect(out.drawingsByPad.p1[0]).toMatchObject({
      title: "Night sky",
      notes: "First telescope drawing",
      favorite: true,
      tags: ["Space", "Night"],
      updatedAt: NOW + 5,
    });
  });

  it("preserves premium visuals in a v4 library", () => {
    const v4 = {
      version: 4,
      activePadId: "p1",
      pads: [
        {
          id: "p1",
          childId: "child-1",
          name: "Magic pad",
          style: "spread",
          design: "moonlight",
          border: "museum-frame",
          decoration: "starry-sky",
          icon: "star",
          coverColor: "#48527E",
          pageColor: "#F7F5FF",
          createdAt: NOW,
        },
      ],
      drawingsByPad: { p1: [] },
    };
    const out = migrateStoreData(v4, NOW);
    expect(out.pads[0]).toMatchObject({
      design: "moonlight",
      border: "museum-frame",
      decoration: "starry-sky",
      icon: "star",
    });
  });

  it("repairs an unsupported sketchpad icon", () => {
    const out = migrateStoreData(
      {
        version: 5,
        activePadId: "p1",
        pads: [
          {
            id: "p1",
            name: "Magic pad",
            style: "vertical",
            design: "sunshine",
            icon: "unknown-icon",
            createdAt: NOW,
          },
        ],
        drawingsByPad: { p1: [] },
      },
      NOW,
    );

    expect(out.pads[0].icon).toBe("cover");
  });

  it("returns a fresh default store for garbage", () => {
    for (const raw of [null, 42, "hi", {}, { version: 9 }]) {
      const out = migrateStoreData(raw, NOW);
      expect(out.pads).toHaveLength(1);
      expect(out.drawingsByPad[out.activePadId]).toEqual([]);
    }
  });
});

describe("slot math", () => {
  it("spread pads hold two drawings per spread, left side first", () => {
    expect(unitCapacity("spread")).toBe(2);
    expect(unitForIndex(0, "spread")).toBe(0);
    expect(sideForIndex(0, "spread")).toBe(0);
    expect(unitForIndex(1, "spread")).toBe(0);
    expect(sideForIndex(1, "spread")).toBe(1);
    expect(unitForIndex(2, "spread")).toBe(1);
    expect(sideForIndex(2, "spread")).toBe(0);
  });

  it("vertical pads hold one drawing per page", () => {
    expect(unitCapacity("vertical")).toBe(1);
    expect(unitForIndex(3, "vertical")).toBe(3);
    expect(sideForIndex(3, "vertical")).toBe(0);
  });

  it("hit-tests drawings on both spread sides and vertical pages", () => {
    const spread = getBookLayout(400, 900);
    const vertical = getPadPageLayout("vertical", 400, 900);
    const square = { width: 100, height: 100 };

    // spread unit 1 holds indices 2 (left) and 3 (right)
    const drawings = [square, square, square, square];
    const leftCenter = {
      x: spread.leftSlot.x + spread.leftSlot.width / 2,
      y: spread.leftSlot.y + spread.leftSlot.height / 2,
    };
    const hitLeft = drawingHitTest(leftCenter.x, leftCenter.y, "spread", 1, drawings, spread, vertical);
    expect(hitLeft?.index).toBe(2);
    const rightCenter = {
      x: spread.rightSlot.x + spread.rightSlot.width / 2,
      y: spread.rightSlot.y + spread.rightSlot.height / 2,
    };
    expect(drawingHitTest(rightCenter.x, rightCenter.y, "spread", 1, drawings, spread, vertical)?.index).toBe(3);

    // a tap on an empty right side misses
    expect(drawingHitTest(rightCenter.x, rightCenter.y, "spread", 1, [square, square, square], spread, vertical)).toBeNull();

    // a tap outside the book misses
    expect(drawingHitTest(2, 2, "spread", 1, drawings, spread, vertical)).toBeNull();

    // vertical page i holds index i
    const vCenter = {
      x: vertical.slots[0].x + vertical.slots[0].width / 2,
      y: vertical.slots[0].y + vertical.slots[0].height / 2,
    };
    expect(drawingHitTest(vCenter.x, vCenter.y, "vertical", 2, drawings, spread, vertical)?.index).toBe(2);
  });

  it("keeps the shell and protruding tabs away from compact phone edges", () => {
    const compact = getPadPageLayout("vertical", 375, 667, 142, 128);
    expect(compact.book.x).toBeGreaterThanOrEqual(28);
    expect(375 - (compact.book.x + compact.book.width)).toBeGreaterThanOrEqual(28);
    // Tabs protrude 14pt beyond the shell, leaving at least 14pt of visible air.
    expect(compact.book.x - 14).toBeGreaterThanOrEqual(14);
  });

  it("album and grid styles slot correctly", () => {
    expect(unitCapacity("album")).toBe(1);
    expect(unitCapacity("grid")).toBe(4);
    expect(slotIndexForIndex(6, "grid")).toBe(2);
    expect(unitForIndex(6, "grid")).toBe(1);
    expect(unitCount(0, "grid")).toBe(1);
    expect(unitCount(4, "grid")).toBe(2);
    expect(unitCount(3, "album")).toBe(4);

    const album = getPadPageLayout("album", 400, 900);
    expect(album.binding).toBe("left");
    expect(album.slots).toHaveLength(1);
    expect(album.book.width).toBeGreaterThan(album.book.height);

    const grid = getPadPageLayout("grid", 400, 900);
    expect(grid.binding).toBe("top");
    expect(grid.slots).toHaveLength(4);

    // hit-test the third grid cell on page 1 → index 1*4+2 = 6
    const spread = getBookLayout(400, 900);
    const square = { width: 100, height: 100 };
    const eight = Array.from({ length: 8 }, () => square);
    const c = grid.slots[2];
    const hit = drawingHitTest(c.x + c.width / 2, c.y + c.height / 2, "grid", 1, eight, spread, grid);
    expect(hit?.index).toBe(6);
  });

  it("strip style holds three drawings per page, stacked with no overlap", () => {
    expect(unitCapacity("strip")).toBe(3);
    expect(unitForIndex(4, "strip")).toBe(1);
    expect(slotIndexForIndex(4, "strip")).toBe(1);
    expect(unitCount(0, "strip")).toBe(1);
    expect(unitCount(3, "strip")).toBe(2);
    expect(unitCount(6, "strip")).toBe(3);

    const strip = getPadPageLayout("strip", 400, 900);
    expect(strip.binding).toBe("top");
    expect(strip.slots).toHaveLength(3);
    // stacked top-to-bottom, each within the page, none overlapping
    const [a, b, c] = strip.slots;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    expect(a.y + a.height).toBeLessThanOrEqual(b.y);
    expect(b.y + b.height).toBeLessThanOrEqual(c.y);
    for (const s of strip.slots) {
      expect(s.x).toBeGreaterThanOrEqual(strip.page.x);
      expect(s.x + s.width).toBeLessThanOrEqual(strip.page.x + strip.page.width + 0.01);
    }

    // hit-test the middle slot on page 1 → index 1*3+1 = 4
    const spread = getBookLayout(400, 900);
    const square = { width: 100, height: 100 };
    const five = Array.from({ length: 5 }, () => square);
    const hit = drawingHitTest(b.x + b.width / 2, b.y + b.height / 2, "strip", 1, five, spread, strip);
    expect(hit?.index).toBe(4);
  });

  it("unitCount includes the trailing scan target", () => {
    // spread: 0 drawings → 1 unit; 1 → 1 (left filled, right open); 2 → 2; 3 → 2; 4 → 3
    expect(unitCount(0, "spread")).toBe(1);
    expect(unitCount(1, "spread")).toBe(1);
    expect(unitCount(2, "spread")).toBe(2);
    expect(unitCount(3, "spread")).toBe(2);
    expect(unitCount(4, "spread")).toBe(3);
    // vertical: n drawings → n+1 pages
    expect(unitCount(0, "vertical")).toBe(1);
    expect(unitCount(2, "vertical")).toBe(3);
  });
});
