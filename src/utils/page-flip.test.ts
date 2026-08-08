import {
  pageFlipProgress,
  pageFlipSettleDuration,
  shouldCompletePageFlip,
} from "@/utils/page-flip";

describe("page flip motion", () => {
  it("maps a full StPageFlip-style edge journey to 0...1", () => {
    expect(pageFlipProgress(-100, 100, 1)).toBe(0.5);
    expect(pageFlipProgress(-200, 100, 1)).toBe(1);
    expect(pageFlipProgress(100, 100, -1)).toBe(0.5);
    expect(pageFlipProgress(200, 100, -1)).toBe(1);
  });

  it("clamps movement away from the intended direction", () => {
    expect(pageFlipProgress(40, 100, 1)).toBe(0);
    expect(pageFlipProgress(-40, 100, -1)).toBe(0);
    expect(pageFlipProgress(-500, 100, 1)).toBe(1);
  });

  it("finishes at the center line or with a decisive fling", () => {
    expect(shouldCompletePageFlip(0.5, 0, 1)).toBe(true);
    expect(shouldCompletePageFlip(0.3, -700, 1)).toBe(true);
    expect(shouldCompletePageFlip(0.3, 700, -1)).toBe(true);
    expect(shouldCompletePageFlip(0.3, 500, 1)).toBe(false);
  });

  it("uses a longer settle when more paper remains to travel", () => {
    expect(pageFlipSettleDuration(0.1, true)).toBeGreaterThan(pageFlipSettleDuration(0.8, true));
    expect(pageFlipSettleDuration(0.8, false)).toBeGreaterThan(pageFlipSettleDuration(0.2, false));
  });
});
