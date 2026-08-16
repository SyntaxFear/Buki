import type { Rect } from "@/utils/book-layout";

export type PageFolioEdge = "left" | "right";

/**
 * Folios sit on the outer paper edge. A single-sheet sketchpad has no facing
 * left page, so its stable outer edge is the right side. Open spreads keep
 * the conventional mirrored placement.
 */
export const PAGE_FOLIO_EDGES = {
  single: "right",
  spreadLeft: "left",
  spreadRight: "right",
} as const satisfies Record<string, PageFolioEdge>;

const PAGE_FOLIO_WIDTH = 32;
const PAGE_FOLIO_BOTTOM_INSET = 7;
const PAGE_FOLIO_LEFT_STAMP_CLEARANCE = 36;
const PAGE_FOLIO_RIGHT_INSET = 8;

/**
 * Returns a page-local baseline for a printed folio. Settled pages and
 * offscreen flip snapshots use this same geometry so the number stays fixed
 * to the paper throughout a turn.
 */
export function pageFolioPosition(
  frame: Rect,
  edge: PageFolioEdge,
  textWidth: number,
  descent: number,
): { x: number; y: number } {
  const boxLeft =
    edge === "left"
      ? frame.x + PAGE_FOLIO_LEFT_STAMP_CLEARANCE
      : frame.x + frame.width - PAGE_FOLIO_WIDTH - PAGE_FOLIO_RIGHT_INSET;

  return {
    x: boxLeft + (PAGE_FOLIO_WIDTH - textWidth) / 2,
    y: frame.y + frame.height - PAGE_FOLIO_BOTTOM_INSET - descent,
  };
}
