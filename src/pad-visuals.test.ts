import { PAD_DESIGNS } from "./pad-designs";
import {
  PAD_BORDERS,
  PAD_DECORATIONS,
  SPREAD_SNAPSHOT_DECORATION_PLACEMENT,
  decorationSidesForPlacement,
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
    expect(
      PAD_DECORATIONS.filter((decoration) => decoration.premium).map(
        (decoration) => decoration.name,
      ),
    ).toEqual([
      "Confetti Pop",
      "Sparkle Trail",
      "Heart Parade",
      "Flower Garden",
      "Starry Sky",
      "Sticker Party",
    ]);
  });

  it("partitions spread decorations between page-turn snapshots", () => {
    expect(SPREAD_SNAPSHOT_DECORATION_PLACEMENT).toEqual({
      turningFront: "right",
      turningBack: "left",
      baseLeft: "left",
      baseRight: "right",
    });
    expect(decorationSidesForPlacement("both")).toEqual({ left: true, right: true });
    expect(decorationSidesForPlacement("left")).toEqual({ left: true, right: false });
    expect(decorationSidesForPlacement("right")).toEqual({ left: false, right: true });
  });

  it("repairs unknown persisted visual identifiers", () => {
    expect(isPadBorderId("museum-frame")).toBe(true);
    expect(isPadBorderId("unknown")).toBe(false);
    expect(isPadDecorationId("starry-sky")).toBe(true);
    expect(isPadDecorationId(null)).toBe(false);
  });
});
