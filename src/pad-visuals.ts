import { isPremiumPadDesign, type PadDesignId } from "@/pad-designs";

export type PadBorderId =
  | "none"
  | "gallery-mat"
  | "polaroid"
  | "torn-paper"
  | "washi-tape"
  | "scalloped"
  | "crayon-edge"
  | "sticker-stars"
  | "museum-frame";

export type PadDecorationId =
  | "none"
  | "confetti-pop"
  | "sparkle-trail"
  | "heart-parade"
  | "flower-garden"
  | "starry-sky"
  | "sticker-party";

export type PadDecorationPlacement = "both" | "left" | "right";

export const SPREAD_SNAPSHOT_DECORATION_PLACEMENT = {
  turningFront: "right",
  turningBack: "left",
  baseLeft: "left",
  baseRight: "right",
} as const satisfies Record<string, PadDecorationPlacement>;

export function decorationSidesForPlacement(placement: PadDecorationPlacement): {
  left: boolean;
  right: boolean;
} {
  return {
    left: placement !== "right",
    right: placement !== "left",
  };
}

export interface PadVisualOption<T extends string> {
  id: T;
  name: string;
  tagline: string;
  premium: boolean;
  previewColor: string;
}

export const PAD_BORDERS: readonly PadVisualOption<PadBorderId>[] = [
  { id: "none", name: "Clean Page", tagline: "No extra frame", premium: false, previewColor: "#F4E9D6" },
  { id: "gallery-mat", name: "Gallery Mat", tagline: "Layered art mat", premium: true, previewColor: "#B7D7D2" },
  { id: "polaroid", name: "Polaroid", tagline: "Instant-photo edge", premium: true, previewColor: "#EEE9DE" },
  { id: "torn-paper", name: "Torn Paper", tagline: "Hand-ripped texture", premium: true, previewColor: "#D7C5A7" },
  { id: "washi-tape", name: "Washi Tape", tagline: "Taped at the corners", premium: true, previewColor: "#F5C85B" },
  { id: "scalloped", name: "Scalloped", tagline: "Playful rounded trim", premium: true, previewColor: "#F3A6BE" },
  { id: "crayon-edge", name: "Crayon Edge", tagline: "Double-drawn outline", premium: true, previewColor: "#6FA9E8" },
  { id: "sticker-stars", name: "Sticker Stars", tagline: "Starry corner stickers", premium: true, previewColor: "#FFD65A" },
  { id: "museum-frame", name: "Museum Frame", tagline: "A tiny golden gallery", premium: true, previewColor: "#C89B4B" },
] as const;

export const PAD_DECORATIONS: readonly PadVisualOption<PadDecorationId>[] = [
  { id: "none", name: "Theme Mark", tagline: "Keep the theme’s small stamp", premium: false, previewColor: "#F4E9D6" },
  { id: "confetti-pop", name: "Confetti Pop", tagline: "Colorful corner dots", premium: true, previewColor: "#FF765E" },
  { id: "sparkle-trail", name: "Sparkle Trail", tagline: "A little magic dust", premium: true, previewColor: "#9B82DF" },
  { id: "heart-parade", name: "Heart Parade", tagline: "Sweet heart stickers", premium: true, previewColor: "#D86485" },
  { id: "flower-garden", name: "Flower Garden", tagline: "Tiny blooming corners", premium: true, previewColor: "#66A86B" },
  { id: "starry-sky", name: "Starry Sky", tagline: "Stars and planet dots", premium: true, previewColor: "#6178C8" },
  { id: "sticker-party", name: "Sticker Party", tagline: "Mixed playful marks", premium: true, previewColor: "#48C6B7" },
] as const;

export function isPadBorderId(value: unknown): value is PadBorderId {
  return typeof value === "string" && PAD_BORDERS.some((option) => option.id === value);
}

export function isPadDecorationId(value: unknown): value is PadDecorationId {
  return typeof value === "string" && PAD_DECORATIONS.some((option) => option.id === value);
}

export function isPremiumPadBorder(id: PadBorderId): boolean {
  return PAD_BORDERS.find((option) => option.id === id)?.premium ?? false;
}

export function isPremiumPadDecoration(id: PadDecorationId): boolean {
  return PAD_DECORATIONS.find((option) => option.id === id)?.premium ?? false;
}

export function hasPremiumPadVisual(input: {
  design: PadDesignId;
  border: PadBorderId;
  decoration: PadDecorationId;
}): boolean {
  return (
    isPremiumPadDesign(input.design) ||
    isPremiumPadBorder(input.border) ||
    isPremiumPadDecoration(input.decoration)
  );
}
