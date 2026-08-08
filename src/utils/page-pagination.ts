import type { PadStyle } from "@/store/drawings";
import { unitCapacity, unitCount } from "@/utils/book-layout";

export type PaginationMarker = number | "gap-start" | "gap-end";

export interface PagePaginationState {
  currentUnit: number;
  filledPages: number;
  filledUnits: number;
  totalUnits: number;
  unitName: "page" | "spread";
}

export function pagePaginationState(
  drawingCount: number,
  style: PadStyle,
  currentUnit: number,
): PagePaginationState {
  const capacity = unitCapacity(style);
  const totalUnits = unitCount(drawingCount, style);
  const filledUnits = drawingCount === 0 ? 0 : Math.ceil(drawingCount / capacity);

  return {
    currentUnit: Math.min(Math.max(0, currentUnit), totalUnits - 1),
    // A spread has one drawing-sized page on each side. Other layouts are a
    // single physical page, even when that page contains several drawings.
    filledPages: style === "spread" ? drawingCount : filledUnits,
    filledUnits,
    totalUnits,
    unitName: style === "spread" ? "spread" : "page",
  };
}

export function paginationMarkers(currentUnit: number, totalUnits: number): PaginationMarker[] {
  if (totalUnits <= 7) return Array.from({ length: totalUnits }, (_, index) => index);

  if (currentUnit <= 2) return [0, 1, 2, 3, "gap-end", totalUnits - 1];
  if (currentUnit >= totalUnits - 3) {
    return [0, "gap-start", totalUnits - 4, totalUnits - 3, totalUnits - 2, totalUnits - 1];
  }

  return [
    0,
    "gap-start",
    currentUnit - 1,
    currentUnit,
    currentUnit + 1,
    "gap-end",
    totalUnits - 1,
  ];
}
