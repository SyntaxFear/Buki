import { PAD_DESIGNS } from "./pad-designs";
import {
  PAD_BORDERS,
  PAD_DECORATIONS,
  hasPremiumPadVisual,
  isPadBorderId,
  isPadDecorationId,
} from "./pad-visuals";

describe("premium sketchpad visuals", () => {
  it("keeps the original themes and clean page free", () => {
    expect(hasPremiumPadVisual({ design: "sunshine", border: "none", decoration: "none" })).toBe(false);
  });

  it("recognizes every premium visual category", () => {
    expect(hasPremiumPadVisual({ design: "moonlight", border: "none", decoration: "none" })).toBe(true);
    expect(hasPremiumPadVisual({ design: "sunshine", border: "gallery-mat", decoration: "none" })).toBe(true);
    expect(hasPremiumPadVisual({ design: "sunshine", border: "none", decoration: "confetti-pop" })).toBe(true);
  });

  it("ships the complete launch pack", () => {
    expect(PAD_DESIGNS.filter((design) => design.premium).map((design) => design.name)).toEqual([
      "Moonlight Magic",
      "Rainbow Studio",
      "Forest Friends",
      "Ocean Adventure",
      "Space Explorer",
      "Candy Cloud",
    ]);
    expect(PAD_BORDERS.filter((border) => border.premium).map((border) => border.name)).toEqual([
      "Gallery Mat",
      "Polaroid",
      "Torn Paper",
      "Washi Tape",
      "Scalloped",
      "Crayon Edge",
      "Sticker Stars",
      "Museum Frame",
    ]);
    expect(PAD_DECORATIONS.some((decoration) => decoration.premium)).toBe(true);
  });

  it("repairs unknown persisted visual identifiers", () => {
    expect(isPadBorderId("museum-frame")).toBe(true);
    expect(isPadBorderId("unknown")).toBe(false);
    expect(isPadDecorationId("starry-sky")).toBe(true);
    expect(isPadDecorationId(null)).toBe(false);
  });
});
