// Palette sampled from the original "Make it Bloom" demo video
export const colors = {
  background: "#EBE6DA",
  page: "#FDF8ED",
  pageEdge: "#F3EDDF",
  bookBorder: "#E8695A",
  bookBorderDark: "#D95B4C",
  spineDot: "#E8967F",
  titleGreen: "#4E9B5E",
  titleTeal: "#4FB8A6",
  titleCoral: "#E8695A",
  vine: "#5B9E63",
  flower: "#E85C4A",
  tapeTeal: "#5EC6B4",
  tapeYellow: "#F2C94C",
  fab: "#E8836F",
  fabPressed: "#D9705C",
  confetti: ["#5EC6B4", "#F2C94C", "#E8695A", "#7FB069", "#F2994A"],
  shutterRing: "#FFFFFF",
  scrimDark: "rgba(30,25,20,0.35)",
} as const;

export const PATRICK_HAND = require("@expo-google-fonts/patrick-hand/400Regular/PatrickHand_400Regular.ttf");

// Book geometry (fractions of screen width)
export const BOOK = {
  widthFrac: 0.88,
  aspect: 0.72, // height / width of the open spread
  cornerRadius: 14,
} as const;
