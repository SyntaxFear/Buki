import { migrateStoreData } from "./migrate";
import {
  drawingHitTest,
  getBookLayout,
  getVerticalLayout,
  sideForIndex,
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
  it("wraps a v1 store into a single default spread pad", () => {
    const v1 = { version: 1, drawings: [drawing(1), drawing(2)] };
    const out = migrateStoreData(v1, NOW);
    expect(out.version).toBe(2);
    expect(out.pads).toHaveLength(1);
    expect(out.pads[0].style).toBe("spread");
    expect(out.pads[0].name).toBe("My Book");
    expect(out.activePadId).toBe(out.pads[0].id);
    expect(out.drawingsByPad[out.pads[0].id]).toHaveLength(2);
  });

  it("passes a valid v2 store through and keeps the active pad", () => {
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
    expect(out.pads).toHaveLength(2);
    expect(out.activePadId).toBe("p2");
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
    const vertical = getVerticalLayout(400, 900);
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
      x: vertical.slot.x + vertical.slot.width / 2,
      y: vertical.slot.y + vertical.slot.height / 2,
    };
    expect(drawingHitTest(vCenter.x, vCenter.y, "vertical", 2, drawings, spread, vertical)?.index).toBe(2);
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
