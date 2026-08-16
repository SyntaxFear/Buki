import {
  HOME_MIN_CONTROL_GAP,
  compactControlGap,
  getHomeBottomControls,
} from "./home-bottom-controls";

describe("home bottom controls", () => {
  it.each([
    [320, 568, 0],
    [375, 667, 0],
    [375, 667, 20],
  ])(
    "keeps pagination clear of capture on a %ipx by %ipx screen",
    (_width, height, safeAreaBottom) => {
      const controls = getHomeBottomControls(height, safeAreaBottom);

      expect(compactControlGap(controls)).toBeGreaterThanOrEqual(
        HOME_MIN_CONTROL_GAP,
      );
    },
  );

  it("preserves the regular-height placement", () => {
    expect(getHomeBottomControls(852, 34)).toEqual({
      bookBottomReserve: 142,
      captureBottom: 60,
    });
  });
});
