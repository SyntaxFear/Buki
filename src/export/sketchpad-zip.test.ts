jest.mock("./export-access", () => ({ requireExportAccess: jest.fn() }));

import type { Drawing, Sketchpad } from "@/store/migrate";
import {
  buildSketchpadZipManifest,
  sketchpadMetadataCsv,
  sketchpadZipFilename,
} from "./sketchpad-zip";

const pad: Sketchpad = {
  id: "pad:summer",
  childId: "child-1",
  name: "Summer Gallery",
  style: "spread",
  design: "sunshine",
  border: "none",
  decoration: "none",
  coverColor: "#4A79D8",
  pageColor: "#FFFDF4",
  createdAt: 1_700_000_000_000,
};

const drawing: Drawing = {
  id: "drawing-1",
  uri: "file:///drawing-1.png",
  photoUri: "file:///photo-1.jpg",
  width: 640,
  height: 480,
  rotation: 2.5,
  addedAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
  title: "Sun, Clouds & Rain",
  notes: "Line one\nLine \"two\"",
  favorite: true,
  tags: ["weather", "school"],
};

describe("sketchpad ZIP metadata", () => {
  it("records complete metadata and missing media explicitly", () => {
    const manifest = buildSketchpadZipManifest({
      pad,
      childName: "Ava",
      generatedAt: 1_700_000_002_000,
      media: [{
        drawing,
        imageFile: null,
        originalFile: "originals/photo-1.jpg",
        missingArtwork: true,
      }],
    });

    expect(manifest.format).toBe("buki-sketchpad-export");
    expect(manifest.version).toBe(1);
    expect(manifest.childName).toBe("Ava");
    expect(manifest.artworks[0]).toMatchObject({
      id: "drawing-1",
      favorite: true,
      tags: ["weather", "school"],
      imageFile: null,
      originalFile: "originals/photo-1.jpg",
      mediaMissing: true,
    });
    expect(manifest.missingFiles).toEqual([
      { artworkId: "drawing-1", kind: "artwork" },
    ]);
  });

  it("quotes commas, line breaks, and quotes in CSV metadata", () => {
    const manifest = buildSketchpadZipManifest({
      pad,
      media: [{ drawing, imageFile: "images/drawing-1.png", originalFile: null }],
      generatedAt: 1_700_000_002_000,
    });
    const csv = sketchpadMetadataCsv(manifest);

    expect(csv).toContain('"Sun, Clouds & Rain"');
    expect(csv).toContain('"Line one\nLine ""two"""');
    expect(csv).toContain("weather | school");
  });

  it("keeps imported metadata inert when the CSV opens in a spreadsheet", () => {
    const manifest = buildSketchpadZipManifest({
      pad: { ...pad, name: "=HYPERLINK(\"https://example.invalid\")" },
      media: [{
        drawing: {
          ...drawing,
          title: "+SUM(1,1)",
          notes: "\t=WEBSERVICE(\"https://example.invalid\")",
          tags: ["@malicious"],
        },
        imageFile: "images/drawing-1.png",
        originalFile: null,
      }],
      generatedAt: 1_700_000_002_000,
    });

    const csv = sketchpadMetadataCsv(manifest);

    expect(csv).toContain("\"'+SUM(1,1)\"");
    expect(csv).toContain("\"'=WEBSERVICE(\"\"https://example.invalid\"\")\"");
    expect(csv).toContain("'@malicious");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.invalid\"\")\"");
  });

  it("creates a share-safe ZIP filename", () => {
    expect(sketchpadZipFilename(pad)).toBe("buki-summer-gallery-export.zip");
  });
});
