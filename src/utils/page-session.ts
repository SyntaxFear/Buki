import type { PadStyle } from "@/store/migrate";
import { unitCapacity, unitCount } from "@/utils/book-layout";

/** The final unit is where the next drawing will land. It may already contain
 * artwork when a multi-slot layout is only partially filled. */
export function finalSketchpadUnit(
  drawingCount: number,
  style: PadStyle,
): number {
  return Math.max(0, unitCount(drawingCount, style) - 1);
}

export function sketchpadUnitImageUris(
  drawings: readonly { uri: string }[],
  unit: number,
  style: PadStyle,
): string[] {
  const capacity = unitCapacity(style);
  const start = Math.max(0, unit) * capacity;
  return drawings.slice(start, start + capacity).map((drawing) => drawing.uri);
}
