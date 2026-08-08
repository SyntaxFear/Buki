export type PadDesignId =
  | "sunshine"
  | "garden"
  | "berry"
  | "sky"
  | "moonlight"
  | "rainbow"
  | "forest"
  | "ocean"
  | "space"
  | "candy";
export type PadTabGlyph = "flower" | "heart" | "leaf" | "dot" | "spark";
export type PadStamp = "paw" | "flower" | "heart" | "spark";

export interface PadDesign {
  id: PadDesignId;
  name: string;
  tagline: string;
  premium: boolean;
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
    premium: false,
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
    premium: false,
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
    premium: false,
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
    premium: false,
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
  {
    id: "moonlight",
    name: "Moonlight Magic",
    tagline: "Indigo, silver & starlight",
    premium: true,
    cover: "#48527E",
    coverDark: "#303858",
    paper: "#F7F5FF",
    pageEdge: "#DCD9EA",
    pageStack: "#EAE7F4",
    ring: "#C6B8F2",
    ringDark: "#8D7CC4",
    ringHole: "#252B4B",
    tabs: [
      { color: "#A8C7FA", glyph: "spark", glyphColor: "#4667A0" },
      { color: "#D7C6FF", glyph: "dot", glyphColor: "#6D5AA2" },
      { color: "#FFE79A", glyph: "flower", glyphColor: "#AA7B1F" },
    ],
    gridDot: "rgba(83,94,148,0.16)",
    slotBorder: "rgba(72,82,126,0.23)",
    stamp: "spark",
    stampColor: "#7D6FBA",
  },
  {
    id: "rainbow",
    name: "Rainbow Studio",
    tagline: "Every color gets a turn",
    premium: true,
    cover: "#6D8DDF",
    coverDark: "#4C67B4",
    paper: "#FFFCF7",
    pageEdge: "#EDE0D5",
    pageStack: "#F6EBE2",
    ring: "#FF7A70",
    ringDark: "#D9504D",
    ringHole: "#31567D",
    tabs: [
      { color: "#FF8175", glyph: "heart", glyphColor: "#B53C39" },
      { color: "#FFD85E", glyph: "flower", glyphColor: "#A77413" },
      { color: "#6FD1B6", glyph: "leaf", glyphColor: "#287760" },
    ],
    gridDot: "rgba(109,141,223,0.16)",
    slotBorder: "rgba(255,122,112,0.23)",
    stamp: "spark",
    stampColor: "#FF7A70",
  },
  {
    id: "forest",
    name: "Forest Friends",
    tagline: "Moss, acorn & woodland pals",
    premium: true,
    cover: "#537A58",
    coverDark: "#36513A",
    paper: "#FBF9EC",
    pageEdge: "#DFDFC6",
    pageStack: "#ECEBD5",
    ring: "#D69A52",
    ringDark: "#9D6932",
    ringHole: "#304534",
    tabs: [
      { color: "#9FC47B", glyph: "leaf", glyphColor: "#416E3D" },
      { color: "#D8AD73", glyph: "dot", glyphColor: "#80572C" },
      { color: "#E9826F", glyph: "heart", glyphColor: "#A94138" },
    ],
    gridDot: "rgba(83,122,88,0.16)",
    slotBorder: "rgba(83,122,88,0.24)",
    stamp: "paw",
    stampColor: "#7A5A37",
  },
  {
    id: "ocean",
    name: "Ocean Adventure",
    tagline: "Lagoon, coral & sea foam",
    premium: true,
    cover: "#2D8DA3",
    coverDark: "#1D6576",
    paper: "#F3FCFB",
    pageEdge: "#CFE8E5",
    pageStack: "#E0F1EF",
    ring: "#FF8A70",
    ringDark: "#CE5A4B",
    ringHole: "#1D5967",
    tabs: [
      { color: "#6ED4C6", glyph: "dot", glyphColor: "#207A6D" },
      { color: "#86BFEF", glyph: "flower", glyphColor: "#3A6E9B" },
      { color: "#FFD274", glyph: "spark", glyphColor: "#A4761D" },
    ],
    gridDot: "rgba(45,141,163,0.15)",
    slotBorder: "rgba(45,141,163,0.23)",
    stamp: "spark",
    stampColor: "#2D8DA3",
  },
  {
    id: "space",
    name: "Space Explorer",
    tagline: "Midnight, comet & planet glow",
    premium: true,
    cover: "#39456D",
    coverDark: "#232C49",
    paper: "#F5F7FF",
    pageEdge: "#D6DBEC",
    pageStack: "#E5E8F4",
    ring: "#9C87E5",
    ringDark: "#6754AA",
    ringHole: "#202641",
    tabs: [
      { color: "#798FE0", glyph: "spark", glyphColor: "#304A9A" },
      { color: "#F5C95D", glyph: "dot", glyphColor: "#9B741B" },
      { color: "#EE7F9D", glyph: "flower", glyphColor: "#9C3654" },
    ],
    gridDot: "rgba(57,69,109,0.16)",
    slotBorder: "rgba(57,69,109,0.25)",
    stamp: "spark",
    stampColor: "#6754AA",
  },
  {
    id: "candy",
    name: "Candy Cloud",
    tagline: "Peach, frosting & lavender",
    premium: true,
    cover: "#D88DB4",
    coverDark: "#AA6287",
    paper: "#FFF9FC",
    pageEdge: "#EEDDE8",
    pageStack: "#F6E9F1",
    ring: "#77C9C1",
    ringDark: "#47968F",
    ringHole: "#75506A",
    tabs: [
      { color: "#FFA6BA", glyph: "heart", glyphColor: "#AD4E68" },
      { color: "#B8A0EA", glyph: "flower", glyphColor: "#6E55A8" },
      { color: "#FFE184", glyph: "dot", glyphColor: "#A97B18" },
    ],
    gridDot: "rgba(216,141,180,0.15)",
    slotBorder: "rgba(119,201,193,0.25)",
    stamp: "heart",
    stampColor: "#D06D9D",
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

export function isPremiumPadDesign(id: PadDesignId): boolean {
  return getPadDesign(id).premium;
}
