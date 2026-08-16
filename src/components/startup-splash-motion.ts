export const STARTUP_SPLASH_IMAGE_WIDTH = 220;
export const STARTUP_SPLASH_IMAGE_ASPECT_RATIO = 983 / 1123;

export const startupSplashTiming = {
  hold: 240,
  settle: 120,
  inhale: 100,
  reveal: 560,
  handoffFade: 120,
  mascotFade: 180,
  reducedMotionFade: 280,
} as const;

export function startupSplashHeaderTransform(
  screenWidth: number,
  screenHeight: number,
  target: { x: number; y: number; width: number; height: number },
  imageWidth = STARTUP_SPLASH_IMAGE_WIDTH,
): { translateX: number; translateY: number; scale: number } {
  const imageHeight = imageWidth / STARTUP_SPLASH_IMAGE_ASPECT_RATIO;
  return {
    translateX: target.x + target.width / 2 - screenWidth / 2,
    translateY: target.y + target.height / 2 - screenHeight / 2,
    scale: Math.min(target.width / imageWidth, target.height / imageHeight),
  };
}

export function startupSplashFinalScale(
  width: number,
  height: number,
  imageWidth = STARTUP_SPLASH_IMAGE_WIDTH,
): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 390;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 844;
  const safeImageWidth =
    Number.isFinite(imageWidth) && imageWidth > 0
      ? imageWidth
      : STARTUP_SPLASH_IMAGE_WIDTH;

  // The bear's opaque center must grow far beyond every screen corner so the
  // mask becomes indistinguishable from a full-screen reveal.
  return Math.max(40, Math.hypot(safeWidth, safeHeight) / (safeImageWidth * 0.08));
}
