import {
  artworkCountLabel,
  childContentCounts,
  childContentSummary,
} from "./child-content-counts";

describe("child content counts", () => {
  it("counts sketchpads and artwork independently for each child", () => {
    expect(
      childContentCounts(
        [{ id: "lina" }, { id: "qa" }],
        [
          { id: "lina-one", childId: "lina" },
          { id: "lina-two", childId: "lina" },
          { id: "qa-one", childId: "qa" },
          { id: "orphan", childId: "removed-child" },
        ],
        {
          "lina-one": [{}, {}, {}],
          "lina-two": [{}],
          "qa-one": [],
          orphan: [{}, {}],
        },
      ),
    ).toEqual({
      lina: { sketchpads: 2, artworks: 4 },
      qa: { sketchpads: 1, artworks: 0 },
    });
  });

  it("formats singular and plural labels naturally", () => {
    expect(childContentSummary({ sketchpads: 1, artworks: 1 })).toBe(
      "1 sketchpad · 1 artwork",
    );
    expect(childContentSummary({ sketchpads: 3, artworks: 8 })).toBe(
      "3 sketchpads · 8 artworks",
    );
    expect(artworkCountLabel(0)).toBe("0 artworks");
    expect(artworkCountLabel(1)).toBe("1 artwork");
  });
});
