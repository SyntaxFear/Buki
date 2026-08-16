import { containImageRect } from "./image-fit";

describe("containImageRect", () => {
  it("shows the complete portrait demo photo on a tall simulator screen", () => {
    const rect = containImageRect(1200, 1600, 1320, 2868);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(554);
    expect(rect.width).toBeCloseTo(1320);
    expect(rect.height).toBeCloseTo(1760);
    expect(rect.scale).toBeCloseTo(1.1);
  });

  it("centers a landscape image without cropping", () => {
    expect(containImageRect(1600, 900, 1200, 1800)).toEqual({
      x: 0,
      y: 562.5,
      width: 1200,
      height: 675,
      scale: 0.75,
    });
  });

  it("fails closed for invalid dimensions", () => {
    expect(containImageRect(0, 1600, 1320, 2868)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scale: 0,
    });
  });
});
