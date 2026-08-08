export const MIN_VIEWER_SCALE = 1;
export const DOUBLE_TAP_VIEWER_SCALE = 2.4;
export const MAX_VIEWER_SCALE = 6;
export const VIEWER_RESET_THRESHOLD = 1.05;

export interface ViewerSize {
  width: number;
  height: number;
}

export interface ViewerPoint {
  x: number;
  y: number;
}

export interface ViewerTranslation {
  x: number;
  y: number;
}

export interface ViewerTransform extends ViewerTranslation {
  scale: number;
}

export function clampViewerScale(scale: number): number {
  "worklet";
  return Math.min(MAX_VIEWER_SCALE, Math.max(MIN_VIEWER_SCALE, scale));
}

export function getViewerTranslationBounds(
  size: ViewerSize,
  scale: number,
): ViewerTranslation {
  "worklet";
  const clampedScale = clampViewerScale(scale);
  return {
    x: (size.width * (clampedScale - 1)) / 2,
    y: (size.height * (clampedScale - 1)) / 2,
  };
}

export function clampViewerTranslation(
  translation: ViewerTranslation,
  size: ViewerSize,
  scale: number,
): ViewerTranslation {
  "worklet";
  const bounds = getViewerTranslationBounds(size, scale);
  return {
    x: bounds.x === 0 ? 0 : Math.min(bounds.x, Math.max(-bounds.x, translation.x)),
    y: bounds.y === 0 ? 0 : Math.min(bounds.y, Math.max(-bounds.y, translation.y)),
  };
}

export function clampViewerTransform(
  transform: ViewerTransform,
  size: ViewerSize,
): ViewerTransform {
  "worklet";
  const scale = clampViewerScale(transform.scale);
  const translation = clampViewerTranslation(transform, size, scale);
  return { scale, x: translation.x, y: translation.y };
}

export function getDoubleTapViewerTarget(
  current: ViewerTransform,
  point: ViewerPoint,
  size: ViewerSize,
): ViewerTransform {
  "worklet";
  if (current.scale > VIEWER_RESET_THRESHOLD) {
    return { scale: MIN_VIEWER_SCALE, x: 0, y: 0 };
  }

  const scale = DOUBLE_TAP_VIEWER_SCALE;
  const anchorX = point.x - size.width / 2;
  const anchorY = point.y - size.height / 2;
  return clampViewerTransform(
    {
      scale,
      x: current.x + (current.scale - scale) * anchorX,
      y: current.y + (current.scale - scale) * anchorY,
    },
    size,
  );
}
