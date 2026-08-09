import type { ArtworkListItem } from "./artwork-organizer";
import {
  artworkTags,
  filterArtworkItems,
  normalizeArtworkText,
  normalizeArtworkTags,
  selectedVisibleArtworkIds,
} from "./artwork-organizer";

const items: ArtworkListItem[] = [
  {
    padId: "pad-1",
    padName: "School Art",
    drawing: {
      id: "art-1",
      uri: "file:///one.png",
      width: 100,
      height: 80,
      rotation: 0,
      addedAt: 100,
      title: "Blue Rocket",
      notes: "Made after science class",
      favorite: true,
      tags: ["Space", "School"],
    },
  },
  {
    padId: "pad-2",
    padName: "Weekend",
    drawing: {
      id: "art-2",
      uri: "file:///two.png",
      width: 100,
      height: 80,
      rotation: 0,
      addedAt: 200,
      title: "Garden",
      favorite: false,
      tags: ["Nature"],
    },
  },
];

describe("artwork organization", () => {
  it("normalizes, deduplicates, and limits tag names", () => {
    expect(normalizeArtworkTags([" Space ", "space", "School   Work", 42])).toEqual([
      "Space",
      "School Work",
    ]);
  });

  it("searches metadata, tags, and sketchpad names", () => {
    expect(filterArtworkItems(items, { query: "science" }).map((item) => item.drawing.id)).toEqual([
      "art-1",
    ]);
    expect(filterArtworkItems(items, { query: "weekend" }).map((item) => item.drawing.id)).toEqual([
      "art-2",
    ]);
    expect(filterArtworkItems(items, { query: "blue rocket" }).map((item) => item.drawing.id)).toEqual([
      "art-1",
    ]);
    expect(filterArtworkItems(items, { query: "SPACE" }).map((item) => item.drawing.id)).toEqual([
      "art-1",
    ]);
  });

  it("normalizes search text without depending on the device locale", () => {
    expect(normalizeArtworkText("  School   Work  ")).toBe("school work");
    expect(normalizeArtworkText("Ｉstanbul")).toBe("istanbul");
    expect(filterArtworkItems(items, { query: "blue   rocket" }).map((item) => item.drawing.id)).toEqual([
      "art-1",
    ]);
  });

  it("combines favorite, sketchpad, and tag filters", () => {
    expect(
      filterArtworkItems(items, { favoritesOnly: true, padId: "pad-1", tag: "space" }).map(
        (item) => item.drawing.id,
      ),
    ).toEqual(["art-1"]);
    expect(filterArtworkItems(items, { padId: "pad-1", tag: "nature" })).toEqual([]);
  });

  it("collects unique tags in display order", () => {
    expect(artworkTags(items)).toEqual(["Nature", "School", "Space"]);
  });

  it("limits bulk actions to artwork still visible after filtering", () => {
    expect(selectedVisibleArtworkIds([items[0]], new Set(["art-1", "art-2"]))).toEqual([
      "art-1",
    ]);
  });
});
