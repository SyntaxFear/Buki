import { BOOK } from "@/theme";

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
  /** Slot where a drawing sits on the right page, screen coordinates */
  rightSlot: Rect;
  spineX: number;
}

const PAGE_INSET = 10;

export function getBookLayout(screenWidth: number, screenHeight: number): BookLayout {
  const width = screenWidth * BOOK.widthFrac;
  const height = width * BOOK.aspect;
  const x = (screenWidth - width) / 2;
  const y = screenHeight * 0.42 - height / 2;

  const pageW = (width - PAGE_INSET * 2) / 2;
  const pageH = height - PAGE_INSET * 2;
  const leftPage = { x: x + PAGE_INSET, y: y + PAGE_INSET, width: pageW, height: pageH };
  const rightPage = { x: x + PAGE_INSET + pageW, y: y + PAGE_INSET, width: pageW, height: pageH };

  const slotW = pageW * 0.74;
  const slotH = pageH * 0.72;
  const rightSlot = {
    x: rightPage.x + (pageW - slotW) / 2,
    y: rightPage.y + (pageH - slotH) / 2,
    width: slotW,
    height: slotH,
  };

  return {
    book: { x, y, width, height },
    leftPage,
    rightPage,
    rightSlot,
    spineX: x + width / 2,
  };
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
