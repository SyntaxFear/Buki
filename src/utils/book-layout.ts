import { BOOK } from "@/theme";
import type { PadStyle } from "@/store/migrate";
import { PAD_GEOMETRY } from "@/pad-designs";

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

/** Single-page pad layout shared by vertical, album, and grid styles. */
export interface PadPageLayout {
  /** Book rect in screen coordinates */
  book: Rect;
  /** The single visible page */
  page: Rect;
  /** Slots where drawings sit, screen coordinates (1 or 4 depending on style) */
  slots: Rect[];
  /** Where the binding rings sit */
  binding: "top" | "left";
  /** The binding line coordinate: y for top-bound pads, x for left-bound */
  spine: number;
}

const PAGE_INSET = PAD_GEOMETRY.pageInset;

/**
 * Apple's standard layout margins for full-width content: 16pt on compact
 * phones, 20pt on larger ones — what native apps use instead of hugging
 * the screen edge.
 */
export function edgeMargin(screenWidth: number): number {
  if (screenWidth < 350) return 22;
  if (screenWidth < 400) return 28;
  return screenWidth >= 430 ? 32 : 30;
}

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

export function getBookLayout(
  screenWidth: number,
  screenHeight: number,
  /** Bottom of the header (title + sketchpad pill); the book never rises above it */
  topOffset = 150,
): BookLayout {
  const width = screenWidth - edgeMargin(screenWidth) * 2;
  const height = Math.min(width * BOOK.aspect, screenHeight * 0.52);
  const x = (screenWidth - width) / 2;
  const y = Math.max(screenHeight * 0.42 - height / 2, topOffset + 10);

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

/**
 * Single-page pad layouts:
 * - vertical: portrait page bound at the top, one drawing per page
 * - album:    landscape page bound at the left, one drawing per page
 * - grid:     portrait page bound at the top, four drawings in a 2x2 grid
 */
export function getPadPageLayout(
  style: Exclude<PadStyle, "spread">,
  screenWidth: number,
  screenHeight: number,
  /** Bottom of the header (title + sketchpad pill) */
  topOffset = 150,
  /** Space reserved at the bottom for the camera button */
  bottomOffset = 110,
): PadPageLayout {
  const width = screenWidth - edgeMargin(screenWidth) * 2;
  const x = (screenWidth - width) / 2;
  const availableH = screenHeight - bottomOffset - (topOffset + 10);

  if (style === "album") {
    // Landscape page, rings along the left edge
    const height = Math.min(width * 0.74, availableH);
    const y = topOffset + 10 + Math.max(0, (availableH - height) * 0.4);
    const page = {
      x: x + PAGE_INSET + 8, // extra room right of the binding rings
      y: y + PAGE_INSET,
      width: width - PAGE_INSET * 2 - 8,
      height: height - PAGE_INSET * 2,
    };
    return {
      book: { x, y, width, height },
      page,
      slots: [slotWithin(page, 0.82, 0.8)],
      binding: "left",
      spine: x + PAGE_INSET + 8,
    };
  }

  // vertical + grid: portrait page, rings along the top edge
  const y = topOffset + 10;
  const height = Math.min(width * 1.34, screenHeight - bottomOffset - y);
  const page = {
    x: x + PAGE_INSET,
    y: y + PAGE_INSET + 8, // extra room under the binding rings
    width: width - PAGE_INSET * 2,
    height: height - PAGE_INSET * 2 - 8,
  };

  const slots =
    style === "grid"
      ? gridSlots(page)
      : style === "strip"
        ? stripSlots(page)
        : [slotWithin(page, 0.8, 0.78)];

  return {
    book: { x, y, width, height },
    page,
    slots,
    binding: "top",
    spine: y + PAGE_INSET + 8,
  };
}

/** Three stacked landscape slots, like a filmstrip. */
function stripSlots(page: Rect): Rect[] {
  const inset = Math.min(page.width, page.height) * 0.045;
  const gap = inset;
  const cellH = (page.height - inset * 2 - gap * 2) / 3;
  const cellW = page.width - inset * 2;
  return [0, 1, 2].map((row) => ({
    x: page.x + inset,
    y: page.y + inset + row * (cellH + gap),
    width: cellW,
    height: cellH,
  }));
}

/** 2x2 slots with breathing room, reading order: TL, TR, BL, BR. */
function gridSlots(page: Rect): Rect[] {
  const inset = Math.min(page.width, page.height) * 0.05;
  const gap = inset;
  const cellW = (page.width - inset * 2 - gap) / 2;
  const cellH = (page.height - inset * 2 - gap) / 2;
  const out: Rect[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      out.push({
        x: page.x + inset + col * (cellW + gap),
        y: page.y + inset + row * (cellH + gap),
        width: cellW,
        height: cellH,
      });
    }
  }
  return out;
}

/** How many drawings one spread/page holds for a given pad style. */
export function unitCapacity(style: PadStyle): number {
  if (style === "spread") return 2;
  if (style === "grid") return 4;
  if (style === "strip") return 3;
  return 1;
}

/** Which slot within its unit a drawing index occupies. */
export function slotIndexForIndex(index: number, style: PadStyle): number {
  return index % unitCapacity(style);
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
  drawings: readonly ({ width: number; height: number } | undefined)[],
  spread: BookLayout,
  padPage: PadPageLayout,
): { index: number; rect: Rect } | null {
  const cap = unitCapacity(style);
  const candidates =
    style === "spread"
      ? [
          { index: 2 * unit, slot: spread.leftSlot },
          { index: 2 * unit + 1, slot: spread.rightSlot },
        ]
      : padPage.slots.map((slot, i) => ({ index: unit * cap + i, slot }));

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
