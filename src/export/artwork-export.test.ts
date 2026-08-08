import { artworkExportBaseName, artworkExportFilename } from "./artwork-export";

const drawing = { id: "drawing:abc/123", title: "  My Bright Sun!  ", addedAt: 1_700_000_000_000 };

describe("artwork export names", () => {
  it("creates stable, share-safe filenames", () => {
    expect(artworkExportBaseName(drawing)).toBe("buki-my-bright-sun-2023-11-14");
    expect(artworkExportFilename(drawing, "png")).toBe("buki-my-bright-sun-2023-11-14.png");
    expect(artworkExportFilename(drawing, "jpg")).toBe("buki-my-bright-sun-2023-11-14.jpg");
    expect(artworkExportFilename(drawing, "card")).toBe(
      "buki-my-bright-sun-2023-11-14-share-card.png",
    );
  });

  it("falls back to the artwork ID when no title exists", () => {
    expect(
      artworkExportFilename({ id: "drawing:abc/123", addedAt: 1_700_000_000_000 }, "png"),
    ).toBe("buki-drawing-abc-123-2023-11-14.png");
  });
});
