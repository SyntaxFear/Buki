import { BOOK } from "@/theme";
import type { PadStyle } from "@/store/migrate";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BookLayout {
  /** Book rect in screen coordinates */
  book: Rect;
  /** Left / right page rects in screen coordinates */
  leftPage: Rect;
  rightPage: Rect;
  /** Slots where drawings sit on each page, screen coordinates */
  leftSlot: Rect;
  rightSlot: Rect;
  spineX: number;
}

export interface VerticalLayout {
  /** Book rect in screen coordinates */
  book: Rect;
  /** The single visible page */
  page: Rect;
  /** Slot where the drawing sits, screen coordinates */
  slot: Rect;
  /** Y of the top binding edge (the vertical book's "spine") */
  spineY: number;
}

const PAGE_INSET = 10;
/** The book bleeds nearly edge-to-edge for maximum drawing size */
const EDGE_MARGIN = 4;

function slotWithin(page: Rect, wFrac: number, hFrac: number): Rect {
  const slotW = page.width * wFrac;
  const slotH = page.height * hFrac;
  return {
    x: page.x + (page.width - slotW) / 2,
    y: page.y + (page.height - slotH) / 2,
    width: slotW,
    height: slotH,
  };
}

export function getBookLayout(screenWidth: number, screenHeight: number): BookLayout {
  const width = screenWidth - EDGE_MARGIN * 2;
  const height = Math.min(width * BOOK.aspect, screenHeight * 0.52);
  const x = (screenWidth - width) / 2;
  const y = screenHeight * 0.42 - height / 2;

  const pageW = (width - PAGE_INSET * 2) / 2;
  const pageH = height - PAGE_INSET * 2;
  const leftPage = { x: x + PAGE_INSET, y: y + PAGE_INSET, width: pageW, height: pageH };
  const rightPage = { x: x + PAGE_INSET + pageW, y: y + PAGE_INSET, width: pageW, height: pageH };

  return {
    book: { x, y, width, height },
    leftPage,
    rightPage,
    leftSlot: slotWithin(leftPage, 0.74, 0.72),
    rightSlot: slotWithin(rightPage, 0.74, 0.72),
    spineX: x + width / 2,
  };
}

/** Portrait single-page book, bound at its top edge like a flip pad. */
export function getVerticalLayout(screenWidth: number, screenHeight: number): VerticalLayout {
  const width = screenWidth - EDGE_MARGIN * 2;
  const height = Math.min(width * 1.34, screenHeight * 0.64);
  const x = (screenWidth - width) / 2;
  const y = screenHeight * 0.44 - height / 2;

  const page = {
    x: x + PAGE_INSET,
    y: y + PAGE_INSET + 8, // extra room under the binding rings
    width: width - PAGE_INSET * 2,
    height: height - PAGE_INSET * 2 - 8,
  };

  return {
    book: { x, y, width, height },
    page,
    slot: slotWithin(page, 0.8, 0.78),
    spineY: y + PAGE_INSET + 8,
  };
}

/** How many drawings one spread/page holds for a given pad style. */
export function unitCapacity(style: PadStyle): number {
  return style === "spread" ? 2 : 1;
}

/** Which spread/page a drawing index lives on. */
export function unitForIndex(index: number, style: PadStyle): number {
  return Math.floor(index / unitCapacity(style));
}

/** 0 = left page, 1 = right page (always 0 for vertical pads). */
export function sideForIndex(index: number, style: PadStyle): 0 | 1 {
  return style === "spread" && index % 2 === 1 ? 1 : 0;
}

/** Number of units (spreads/pages) that hold drawings, plus the empty end unit. */
export function unitCount(drawingCount: number, style: PadStyle): number {
  return Math.floor(drawingCount / unitCapacity(style)) + 1;
}

/**
 * Which drawing (if any) sits under a screen point on the current
 * spread/page. Returns its index and its fitted on-page rect (the zoom
 * transition's origin).
 */
export function drawingHitTest(
  px: number,
  py: number,
  style: PadStyle,
  unit: number,
  drawings: ReadonlyArray<{ width: number; height: number } | undefined>,
  spread: BookLayout,
  vertical: VerticalLayout,
): { index: number; rect: Rect } | null {
  const candidates =
    style === "spread"
      ? [
          { index: 2 * unit, slot: spread.leftSlot },
          { index: 2 * unit + 1, slot: spread.rightSlot },
        ]
      : [{ index: unit, slot: vertical.slot }];

  const HIT_PAD = 10;
  for (const c of candidates) {
    const d = drawings[c.index];
    if (!d) continue;
    const r = fitRect(d.width, d.height, c.slot);
    if (
      px >= r.x - HIT_PAD &&
      px <= r.x + r.width + HIT_PAD &&
      py >= r.y - HIT_PAD &&
      py <= r.y + r.height + HIT_PAD
    ) {
      return { index: c.index, rect: r };
    }
  }
  return null;
}

/** Contain-fit a w×h image into a slot, returns the fitted rect. */
export function fitRect(imgW: number, imgH: number, slot: Rect): Rect {
  const scale = Math.min(slot.width / imgW, slot.height / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  };
}
