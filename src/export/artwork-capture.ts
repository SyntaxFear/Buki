export const ARTWORK_EXPORT_PIXEL_WIDTH = 1600;

export interface ArtworkCapturePlan {
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  useRenderInContext: false;
}

export function artworkCapturePlan(
  ratio: number,
  pixelRatio: number,
): ArtworkCapturePlan {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("Artwork export ratio must be positive.");
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error("Device pixel ratio must be positive.");
  }

  const pixelHeight = Math.round(ARTWORK_EXPORT_PIXEL_WIDTH / ratio);
  return {
    width: ARTWORK_EXPORT_PIXEL_WIDTH / pixelRatio,
    height: pixelHeight / pixelRatio,
    pixelWidth: ARTWORK_EXPORT_PIXEL_WIDTH,
    pixelHeight,
    useRenderInContext: false,
  };
}
