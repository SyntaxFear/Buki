import {
  ARTWORK_EXPORT_PIXEL_WIDTH,
  artworkCapturePlan,
} from "./artwork-capture";

describe("artwork export capture plan", () => {
  it("converts target pixels to iOS points instead of creating a 3x blank canvas", () => {
    const plan = artworkCapturePlan(4 / 3, 3);

    expect(plan).toEqual({
      width: ARTWORK_EXPORT_PIXEL_WIDTH / 3,
      height: 400,
      pixelWidth: 1600,
      pixelHeight: 1200,
      useRenderInContext: false,
    });
  });

  it("creates the intended 1600 by 2000 share-card output", () => {
    const plan = artworkCapturePlan(4 / 5, 2);

    expect(plan.width).toBe(800);
    expect(plan.height).toBe(1000);
    expect(plan.pixelWidth).toBe(1600);
    expect(plan.pixelHeight).toBe(2000);
  });

  it("rejects invalid ratios and pixel scales", () => {
    expect(() => artworkCapturePlan(0, 3)).toThrow("ratio");
    expect(() => artworkCapturePlan(1, 0)).toThrow("pixel ratio");
  });
});
