export type PadDesignId = "sunshine" | "garden" | "berry" | "sky";
export type PadTabGlyph = "flower" | "heart" | "leaf" | "dot";
export type PadStamp = "paw" | "flower" | "heart" | "spark";

export interface PadDesign {
  id: PadDesignId;
  name: string;
  tagline: string;
  cover: string;
  coverDark: string;
  paper: string;
  pageEdge: string;
  pageStack: string;
  ring: string;
  ringDark: string;
  ringHole: string;
  tabs: readonly [
    { color: string; glyph: PadTabGlyph; glyphColor: string },
    { color: string; glyph: PadTabGlyph; glyphColor: string },
    { color: string; glyph: PadTabGlyph; glyphColor: string },
  ];
  gridDot: string;
  slotBorder: string;
  stamp: PadStamp;
  stampColor: string;
}

/** One radius and spacing language shared by every sketchpad design. */
export const PAD_GEOMETRY = {
  shellRadius: 24,
  pageRadius: 18,
  slotRadius: 14,
  tabRadius: 15,
  tabProtrusion: 14,
  pageInset: 12,
} as const;

export const PAD_DESIGNS: readonly PadDesign[] = [
  {
    id: "sunshine",
    name: "Sunshine Studio",
    tagline: "Blue, coral & bright",
    cover: "#4A79D8",
    coverDark: "#315CA8",
    paper: "#FFFDF4",
    pageEdge: "#F2E5CD",
    pageStack: "#F7ECD8",
    ring: "#FF765E",
    ringDark: "#D95746",
    ringHole: "#244D72",
    tabs: [
      { color: "#48C6B7", glyph: "flower", glyphColor: "#167D82" },
      { color: "#FFD65A", glyph: "heart", glyphColor: "#D95746" },
      { color: "#FF765E", glyph: "dot", glyphColor: "#C94739" },
    ],
    gridDot: "rgba(255,118,94,0.16)",
    slotBorder: "rgba(74,121,216,0.19)",
    stamp: "paw",
    stampColor: "#FF765E",
  },
  {
    id: "garden",
    name: "Garden Club",
    tagline: "Teal, leaf & butter",
    cover: "#167D82",
    coverDark: "#0E6266",
    paper: "#FFFCF1",
    pageEdge: "#E8E5C8",
    pageStack: "#F3F1D8",
    ring: "#F4B83F",
    ringDark: "#C88C20",
    ringHole: "#185B5D",
    tabs: [
      { color: "#8BCB75", glyph: "leaf", glyphColor: "#397B42" },
      { color: "#86B8EA", glyph: "flower", glyphColor: "#315CA8" },
      { color: "#FF8B73", glyph: "heart", glyphColor: "#C94739" },
    ],
    gridDot: "rgba(102,168,107,0.17)",
    slotBorder: "rgba(22,125,130,0.19)",
    stamp: "flower",
    stampColor: "#66A86B",
  },
  {
    id: "berry",
    name: "Berry Pop",
    tagline: "Raspberry, lilac & mint",
    cover: "#D86485",
    coverDark: "#A94565",
    paper: "#FFF8F5",
    pageEdge: "#F1DDD9",
    pageStack: "#F7E9E5",
    ring: "#9B82DF",
    ringDark: "#7059B7",
    ringHole: "#584477",
    tabs: [
      { color: "#FFD65A", glyph: "flower", glyphColor: "#B97819" },
      { color: "#70D0BD", glyph: "heart", glyphColor: "#167D82" },
      { color: "#FFA7B9", glyph: "dot", glyphColor: "#A94565" },
    ],
    gridDot: "rgba(216,100,133,0.16)",
    slotBorder: "rgba(155,130,223,0.20)",
    stamp: "heart",
    stampColor: "#D86485",
  },
  {
    id: "sky",
    name: "Sky Parade",
    tagline: "Periwinkle, sun & coral",
    cover: "#769CE3",
    coverDark: "#5375B8",
    paper: "#F8FCFF",
    pageEdge: "#DDEAF4",
    pageStack: "#EAF3F8",
    ring: "#FFD65A",
    ringDark: "#D7AD31",
    ringHole: "#315978",
    tabs: [
      { color: "#FF8B73", glyph: "flower", glyphColor: "#C94739" },
      { color: "#6FC3A0", glyph: "leaf", glyphColor: "#347858" },
      { color: "#A98BE6", glyph: "heart", glyphColor: "#6247A7" },
    ],
    gridDot: "rgba(74,121,216,0.15)",
    slotBorder: "rgba(83,117,184,0.20)",
    stamp: "spark",
    stampColor: "#769CE3",
  },
] as const;

export const DEFAULT_PAD_DESIGN_ID: PadDesignId = "sunshine";

export function isPadDesignId(value: unknown): value is PadDesignId {
  return typeof value === "string" && PAD_DESIGNS.some((design) => design.id === value);
}

export function inferPadDesignId(coverColor?: string): PadDesignId {
  const cover = coverColor?.toUpperCase();
  if (["#E8695A", "#FF765E", "#D86485"].includes(cover ?? "")) return "berry";
  if (["#5EC6B4", "#167D82", "#7FB069", "#66A86B"].includes(cover ?? "")) return "garden";
  if (["#769CE3", "#6FA9E8", "#F2C94C", "#FFD65A"].includes(cover ?? "")) return "sky";
  return DEFAULT_PAD_DESIGN_ID;
}

export function getPadDesign(id?: string, coverColor?: string): PadDesign {
  const resolvedId = isPadDesignId(id) ? id : inferPadDesignId(coverColor);
  return PAD_DESIGNS.find((design) => design.id === resolvedId) ?? PAD_DESIGNS[0];
}
