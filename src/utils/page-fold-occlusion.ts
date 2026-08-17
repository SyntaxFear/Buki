export const PAGE_FOLD_OCCLUSION_BEND_START = 0.03;
export const PAGE_FOLD_OCCLUSION_BEND_END = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Mirrors the page-turn shader at the binding line. A value of 1 means the
 * loose folded sheet is physically crossing that point and should cover the
 * binding hardware; 0 means the ring remains above the settled paper.
 */
export function bindingFoldOcclusionAlpha({
  progress,
  curl,
  cross,
  pageExtent,
}: {
  progress: number;
  curl: number;
  /** Position along the binding, normalized to 0...1. */
  cross: number;
  pageExtent: number;
}): number {
  const turn = clamp(progress, 0, 1);
  const bend = Math.sin(turn * Math.PI);
  const anchor = clamp(curl, 0.08, 0.92);
  const crossPosition = clamp(cross, 0, 1);
  const side = anchor < 0.5 ? 1 : -1;
  const tilt = pageExtent * 0.42 * bend;
  const crease =
    pageExtent * (1 - turn) + side * tilt * (crossPosition - anchor);
  const tip = 2 * crease - pageExtent;
  const foldedSheetCrossesBinding =
    crease < pageExtent && tip <= 0 && crease >= 0;

  if (!foldedSheetCrossesBinding) return 0;

  return smoothstep(
    PAGE_FOLD_OCCLUSION_BEND_START,
    PAGE_FOLD_OCCLUSION_BEND_END,
    bend,
  );
}
