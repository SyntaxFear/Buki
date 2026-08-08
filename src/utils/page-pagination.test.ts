import { pagePaginationState, paginationMarkers } from "@/utils/page-pagination";

describe("page pagination", () => {
  it("counts portrait pages and preserves the next empty page", () => {
    expect(pagePaginationState(7, "vertical", 7)).toEqual({
      currentUnit: 7,
      filledPages: 7,
      filledUnits: 7,
      totalUnits: 8,
      unitName: "page",
    });
  });

  it("counts both sides of a spread as filled pages", () => {
    expect(pagePaginationState(3, "spread", 1)).toEqual({
      currentUnit: 1,
      filledPages: 3,
      filledUnits: 2,
      totalUnits: 2,
      unitName: "spread",
    });
  });

  it("counts a partially filled grid as one physical page", () => {
    expect(pagePaginationState(5, "grid", 1)).toMatchObject({
      filledPages: 2,
      filledUnits: 2,
      totalUnits: 2,
    });
  });

  it("collapses long books around the active page", () => {
    expect(paginationMarkers(5, 12)).toEqual([
      0,
      "gap-start",
      4,
      5,
      6,
      "gap-end",
      11,
    ]);
  });
});
