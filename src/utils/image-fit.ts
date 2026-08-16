export interface ImageFitRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** Center an image inside a viewport without cropping any source pixels. */
export function containImageRect(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ImageFitRect {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0, scale: 0 };
  }

  const scale = Math.min(
    viewportWidth / sourceWidth,
    viewportHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (viewportWidth - width) / 2,
    y: (viewportHeight - height) / 2,
    width,
    height,
    scale,
  };
}
