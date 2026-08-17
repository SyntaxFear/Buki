import type { PadStyle } from "@/store/migrate";
import { unitForIndex } from "@/utils/book-layout";

export type CaptureReviewSource = "camera" | "gallery" | "demo";

export function captureReviewTargetUnit(
  drawingCount: number,
  style: PadStyle,
): number {
  return unitForIndex(Math.max(0, drawingCount), style);
}

export function captureReviewRetryLabel(
  source: CaptureReviewSource,
): "Retake" | "Choose another" | "Try another" {
  if (source === "gallery") return "Choose another";
  if (source === "demo") return "Try another";
  return "Retake";
}
