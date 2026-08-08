import type { Drawing, Sketchpad } from "@/store/migrate";
import { buildSketchpadPdfDocument, sketchpadPdfFilename } from "./sketchpad-pdf";

const pad: Sketchpad = {
  id: "pad:summer",
  childId: "child-1",
  name: "Summer <Gallery>",
  style: "grid",
  design: "rainbow",
  border: "museum-frame",
  decoration: "starry-sky",
  coverColor: "#6D8DDF",
  pageColor: "#FFFCF7",
  createdAt: 1_700_000_000_000,
};

function drawing(index: number): Drawing {
  return {
    id: `art-${index}`,
    uri: `file:///art-${index}.png`,
    width: 600,
    height: 800,
    rotation: index,
    addedAt: 1_700_000_000_000 + index,
    title: index === 0 ? "Sun & <script>alert(1)</script>" : `Artwork ${index}`,
    notes: "A bright day",
    tags: ["sun", "outside"],
  };
}

describe("sketchpad PDF", () => {
  it("uses the selected layout capacity and escapes user content", () => {
    const artworks = Array.from({ length: 5 }, (_, index) => ({
      drawing: drawing(index),
      dataUri: index === 4 ? null : `data:image/png;base64,abc${index}`,
    }));
    const result = buildSketchpadPdfDocument({
      pad,
      artworks,
      childName: "Ava & Mia",
      generatedAt: 1_700_000_000_000,
    });

    expect(result.width).toBe(595);
    expect(result.height).toBe(842);
    expect(result.pageCount).toBe(3); // cover + two 4-up content pages
    expect(result.html).toContain("style-grid");
    expect(result.html).toContain("border-museum-frame");
    expect(result.html).toContain("Ava &amp; Mia’s collection");
    expect(result.html).toContain("Sun &amp; &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).toContain("Image unavailable");
  });

  it("uses landscape pages for an open spread and includes an empty content page", () => {
    const result = buildSketchpadPdfDocument({
      pad: { ...pad, style: "spread" },
      artworks: [],
      generatedAt: 1_700_000_000_000,
    });
    expect(result.width).toBe(842);
    expect(result.height).toBe(595);
    expect(result.pageCount).toBe(2);
    expect(result.html).toContain("Room for the next masterpiece");
  });

  it("creates a share-safe PDF filename", () => {
    expect(sketchpadPdfFilename(pad)).toBe("buki-summer-gallery-sketchpad.pdf");
  });
});
