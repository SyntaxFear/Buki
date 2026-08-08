import {
  DOUBLE_TAP_VIEWER_SCALE,
  MAX_VIEWER_SCALE,
  MIN_VIEWER_SCALE,
  clampViewerScale,
  clampViewerTransform,
  getDoubleTapViewerTarget,
  getViewerTranslationBounds,
} from "./image-viewer-transform";

const size = { width: 300, height: 400 };

describe("image viewer transforms", () => {
  it("clamps scale to the supported zoom range", () => {
    expect(clampViewerScale(0.4)).toBe(MIN_VIEWER_SCALE);
    expect(clampViewerScale(2.5)).toBe(2.5);
    expect(clampViewerScale(9)).toBe(MAX_VIEWER_SCALE);
  });

  it("allows no translation at 1x", () => {
    expect(getViewerTranslationBounds(size, 1)).toEqual({ x: 0, y: 0 });
    expect(clampViewerTransform({ scale: 1, x: 90, y: -80 }, size)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it("clamps translation to the scaled image edges", () => {
    expect(clampViewerTransform({ scale: 2, x: 400, y: -500 }, size)).toEqual({
      scale: 2,
      x: 150,
      y: -200,
    });
  });

  it("double-taps the center without shifting the image", () => {
    expect(
      getDoubleTapViewerTarget(
        { scale: 1, x: 0, y: 0 },
        { x: size.width / 2, y: size.height / 2 },
        size,
      ),
    ).toEqual({ scale: DOUBLE_TAP_VIEWER_SCALE, x: 0, y: 0 });
  });

  it("keeps an edge double-tap inside the pan bounds", () => {
    const target = getDoubleTapViewerTarget(
      { scale: 1, x: 0, y: 0 },
      { x: size.width, y: 0 },
      size,
    );
    const bounds = getViewerTranslationBounds(size, DOUBLE_TAP_VIEWER_SCALE);

    expect(target).toEqual({
      scale: DOUBLE_TAP_VIEWER_SCALE,
      x: -bounds.x,
      y: bounds.y,
    });
  });

  it("resets any zoomed image on the next double-tap", () => {
    expect(
      getDoubleTapViewerTarget(
        { scale: 2.4, x: -80, y: 100 },
        { x: 20, y: 30 },
        size,
      ),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
