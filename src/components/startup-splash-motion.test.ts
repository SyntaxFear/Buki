import {
  STARTUP_SPLASH_IMAGE_WIDTH,
  startupSplashFinalScale,
  startupSplashHeaderTransform,
  startupSplashTiming,
} from "@/components/startup-splash-motion";

describe("startup splash motion", () => {
  it("expands the bear mask far beyond a phone viewport", () => {
    const scale = startupSplashFinalScale(393, 852);

    expect(scale).toBeGreaterThan(50);
    expect(scale * STARTUP_SPLASH_IMAGE_WIDTH).toBeGreaterThan(10_000);
  });

  it("adapts the final reveal scale to larger screens", () => {
    expect(startupSplashFinalScale(430, 932)).toBeGreaterThan(
      startupSplashFinalScale(375, 667),
    );
  });

  it("falls back safely when layout dimensions are not ready", () => {
    const scale = startupSplashFinalScale(0, Number.NaN, 0);

    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThanOrEqual(40);
  });

  it("keeps the custom reveal perceptible without a long startup hold", () => {
    expect(startupSplashTiming.hold).toBeGreaterThanOrEqual(150);
    expect(startupSplashTiming.hold).toBeLessThanOrEqual(250);
    expect(startupSplashTiming.reducedMotionFade).toBeLessThanOrEqual(300);
  });

  it("lands the splash bear on the exact header mascot center and size", () => {
    const target = { x: 305, y: 25, width: 62, height: 71 };
    const transform = startupSplashHeaderTransform(375, 667, target);
    const renderedWidth = STARTUP_SPLASH_IMAGE_WIDTH * transform.scale;
    const renderedHeight =
      (STARTUP_SPLASH_IMAGE_WIDTH / (983 / 1123)) * transform.scale;

    expect(375 / 2 + transform.translateX).toBe(target.x + target.width / 2);
    expect(667 / 2 + transform.translateY).toBe(
      target.y + target.height / 2,
    );
    expect(renderedWidth).toBeCloseTo(target.width, 1);
    expect(renderedHeight).toBeLessThanOrEqual(target.height);
  });
});
