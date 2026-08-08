// Garden Path header + Sunshine Studio sketchpad palette.
// The semantic names keep the rest of the app coherent while the underlying
// colors stay intentionally small and recognizable to children.
export const colors = {
  background: "#FFF5E5",
  backgroundDeep: "#F8ECD4",
  surface: "#FFFDF7",
  surfaceAlt: "#F7ECD8",
  page: "#FFFDF4",
  pageEdge: "#F2E5CD",
  pageShadow: "rgba(71,74,61,0.18)",
  bookBorder: "#4A79D8",
  bookBorderDark: "#315CA8",
  ringCoral: "#FF765E",
  ringCoralDark: "#D95746",
  ringHole: "#244D72",
  spineDot: "#FF8B73",
  titleGreen: "#167D82",
  titleTeal: "#167D82",
  titleCoral: "#FF765E",
  titleYellow: "#F4B83F",
  titleBlue: "#6FA9E8",
  vine: "#167D82",
  vineSoft: "#D8D5B5",
  flower: "#FF765E",
  bloomTeal: "#167D82",
  bloomYellow: "#FFD65A",
  bloomBlue: "#6FA9E8",
  bloomGreen: "#66A86B",
  tabTeal: "#48C6B7",
  tabYellow: "#FFD65A",
  tabCoral: "#FF765E",
  tapeTeal: "#48C6B7",
  tapeYellow: "#FFD65A",
  ink: "#28435A",
  mutedText: "#75685A",
  border: "rgba(40,67,90,0.13)",
  gridDot: "rgba(255,118,94,0.16)",
  slotBorder: "rgba(74,121,216,0.18)",
  fab: "#FF765E",
  fabPressed: "#E65F4B",
  confetti: ["#48C6B7", "#FFD65A", "#FF765E", "#66A86B", "#6FA9E8"],
  shutterRing: "#FFFFFF",
  scrimDark: "rgba(32,47,54,0.34)",
} as const;

export const PATRICK_HAND = require("@expo-google-fonts/patrick-hand/400Regular/PatrickHand_400Regular.ttf");

/** Cover colors a sketchpad can be born with (main + darker stitch tone). */
export const PAD_COLORS = [
  { main: "#4A79D8", dark: "#315CA8" }, // studio blue
  { main: "#167D82", dark: "#0E6266" }, // lagoon teal
  { main: "#FF765E", dark: "#D95746" }, // coral
  { main: "#FFD65A", dark: "#D7AD31" }, // butter yellow
  { main: "#66A86B", dark: "#4E8753" }, // leaf green
] as const;

/** Soft page tints that keep crayon drawings readable. */
export const PAGE_COLORS = [
  "#FFFDF4", // studio cream
  "#ECF8F1", // mint
  "#EDF5FC", // sky
  "#FFF0EC", // blush
  "#FFF8DD", // butter
  "#F4EFFC", // lavender
] as const;

export function padDarkColor(main: string): string {
  const current = PAD_COLORS.find((c) => c.main === main)?.dark;
  if (current) return current;

  // Existing installations keep their saved pad colors after the rebrand.
  // Preserve a matching edge tone instead of applying the new blue fallback.
  const legacy: Record<string, string> = {
    "#E8695A": "#D95B4C",
    "#5EC6B4": "#4BAE9D",
    "#F2C94C": "#DDB43A",
    "#7FB069": "#6C9C58",
    "#6C9BD1": "#5A87BC",
  };
  return legacy[main] ?? colors.bookBorderDark;
}

// Book geometry (fractions of screen width)
export const BOOK = {
  widthFrac: 0.88,
  aspect: 0.72, // height / width of the open spread
  cornerRadius: 14,
} as const;
