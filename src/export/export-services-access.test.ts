const mockRequireExportAccess = jest.fn();
const mockPrintToFileAsync = jest.fn();
const mockCopies: Array<{ source: string; destination: string }> = [];
const mockWrites: string[] = [];
const mockDeletes: string[] = [];

jest.mock("./export-access", () => ({
  requireExportAccess: (source: string) => mockRequireExportAccess(source),
}));

jest.mock("expo-print", () => ({
  printToFileAsync: (...args: unknown[]) => mockPrintToFileAsync(...args),
}));

jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class MockFile {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      this.uri = parts.length === 1
        ? String(parts[0])
        : `cache://${String(parts[1])}`;
    }

    get exists() {
      return !mockDeletes.includes(this.uri);
    }

    async base64() {
      return "aGVsbG8=";
    }

    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }

    async copy(destination: { uri: string }) {
      mockCopies.push({ source: this.uri, destination: destination.uri });
    }

    write() {
      mockWrites.push(this.uri);
    }

    delete() {
      mockDeletes.push(this.uri);
    }
  },
}));

import { ProFeatureRequiredError } from "@/subscription/access";
import type { Drawing, Sketchpad } from "@/store/migrate";
import { copyArtworkExport } from "./artwork-export";
import { createSketchpadPdf } from "./sketchpad-pdf";
import { createSketchpadZip } from "./sketchpad-zip";

const pad: Sketchpad = {
  id: "pad-a",
  childId: "child-a",
  name: "My Book",
  style: "spread",
  design: "sunshine",
  border: "none",
  decoration: "none",
  coverColor: "#FFD65A",
  pageColor: "#FFFDF4",
  createdAt: 1,
};

const drawing: Drawing = {
  id: "art-a",
  uri: "file:///art-a.png",
  width: 100,
  height: 120,
  rotation: 0,
  addedAt: 1_700_000_000_000,
};

describe("export service authorization", () => {
  beforeEach(() => {
    mockRequireExportAccess.mockReset();
    mockPrintToFileAsync.mockReset();
    mockPrintToFileAsync.mockResolvedValue({
      uri: "file:///printed.pdf",
      numberOfPages: 2,
    });
    mockCopies.length = 0;
    mockWrites.length = 0;
    mockDeletes.length = 0;
  });

  it("rechecks individual image access after the copy", async () => {
    await expect(copyArtworkExport(drawing.uri, drawing, "png")).resolves.toContain(".png");

    expect(mockRequireExportAccess.mock.calls.map(([source]) => source)).toEqual([
      "artwork_png_export",
      "artwork_png_export_commit",
    ]);
    expect(mockCopies).toHaveLength(1);
  });

  it("removes an image export rejected at commit time", async () => {
    mockRequireExportAccess
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new ProFeatureRequiredError("exportData");
      });

    await expect(copyArtworkExport(drawing.uri, drawing, "png")).rejects.toEqual(
      new ProFeatureRequiredError("exportData"),
    );
    expect(mockDeletes).toEqual([expect.stringContaining(".png")]);
  });

  it("rechecks PDF access before and after publishing the result", async () => {
    await expect(createSketchpadPdf({ pad, drawings: [drawing] })).resolves.toMatchObject({
      pageCount: 2,
      missingCount: 0,
    });

    expect(mockRequireExportAccess.mock.calls.map(([source]) => source)).toEqual([
      "sketchpad_pdf_export",
      "sketchpad_pdf_export_commit",
      "sketchpad_pdf_export_complete",
    ]);
    expect(mockCopies).toContainEqual({
      source: "file:///printed.pdf",
      destination: expect.stringContaining(".pdf"),
    });
  });

  it("rechecks ZIP access before and after writing the result", async () => {
    await expect(createSketchpadZip({ pad, drawings: [drawing] })).resolves.toMatchObject({
      artworkCount: 1,
      missingCount: 0,
    });

    expect(mockRequireExportAccess.mock.calls.map(([source]) => source)).toEqual([
      "sketchpad_zip_export",
      "sketchpad_zip_export_commit",
      "sketchpad_zip_export_complete",
    ]);
    expect(mockWrites).toEqual([expect.stringContaining(".zip")]);
  });
});
