const mockRequireExportAccess = jest.fn();
const mockPrintToFileAsync = jest.fn();
const mockCopies: Array<{ source: string; destination: string }> = [];
const mockWrites: string[] = [];
const mockDeletes: string[] = [];
const mockLegacyDeletes: string[] = [];
const mockFileConstructorErrors = new Set<string>();
const mockReleaseSource = jest.fn();

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
      if (mockFileConstructorErrors.has(this.uri)) {
        throw new Error(`Could not construct ${this.uri}`);
      }
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

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: async (uri: string) => {
    mockLegacyDeletes.push(uri);
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
    mockLegacyDeletes.length = 0;
    mockFileConstructorErrors.clear();
    mockReleaseSource.mockReset();
  });

  it("rechecks individual image access after the copy", async () => {
    await expect(copyArtworkExport(drawing.uri, drawing, "png")).resolves.toContain(".png");

    expect(mockRequireExportAccess.mock.calls.map(([source]) => source)).toEqual([
      "artwork_png_export",
      "artwork_png_export_commit",
    ]);
    expect(mockCopies).toHaveLength(1);
  });

  it("releases a temporary image source after a successful copy", async () => {
    await expect(copyArtworkExport(
      "file:///capture.jpg",
      drawing,
      "jpg",
      { releaseSource: mockReleaseSource },
    )).resolves.toContain(".jpg");

    expect(mockReleaseSource).toHaveBeenCalledTimes(1);
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

  it("releases a temporary image source when commit access is rejected", async () => {
    mockRequireExportAccess
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new ProFeatureRequiredError("exportData");
      });

    await expect(copyArtworkExport(
      "file:///capture.jpg",
      drawing,
      "jpg",
      { releaseSource: mockReleaseSource },
    )).rejects.toEqual(new ProFeatureRequiredError("exportData"));

    expect(mockReleaseSource).toHaveBeenCalledTimes(1);
    expect(mockDeletes).toEqual([expect.stringContaining(".jpg")]);
  });

  it("releases a temporary image source when access expires before copying", async () => {
    mockRequireExportAccess.mockImplementationOnce(() => {
      throw new ProFeatureRequiredError("exportData");
    });

    await expect(copyArtworkExport(
      "file:///capture.jpg",
      drawing,
      "jpg",
      { releaseSource: mockReleaseSource },
    )).rejects.toEqual(new ProFeatureRequiredError("exportData"));

    expect(mockCopies).toHaveLength(0);
    expect(mockReleaseSource).toHaveBeenCalledTimes(1);
  });

  it("releases a temporary image source when filename metadata is invalid", async () => {
    await expect(copyArtworkExport(
      "file:///capture.jpg",
      { ...drawing, addedAt: Number.NaN },
      "jpg",
      { releaseSource: mockReleaseSource },
    )).rejects.toThrow("Invalid time value");

    expect(mockCopies).toHaveLength(0);
    expect(mockReleaseSource).toHaveBeenCalledTimes(1);
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
    expect(mockDeletes).toEqual(["file:///printed.pdf"]);
  });

  it("removes both PDF files when commit access is rejected", async () => {
    mockRequireExportAccess
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new ProFeatureRequiredError("exportData");
      });

    await expect(createSketchpadPdf({ pad, drawings: [drawing] })).rejects.toEqual(
      new ProFeatureRequiredError("exportData"),
    );

    expect(mockCopies).toHaveLength(0);
    expect(mockDeletes).toEqual([
      expect.stringContaining(".pdf"),
      "file:///printed.pdf",
    ]);
  });

  it("removes both PDF files when access expires after copying", async () => {
    mockRequireExportAccess
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new ProFeatureRequiredError("exportData");
      });

    await expect(createSketchpadPdf({ pad, drawings: [drawing] })).rejects.toEqual(
      new ProFeatureRequiredError("exportData"),
    );

    expect(mockCopies).toHaveLength(1);
    expect(mockDeletes).toEqual([
      expect.stringContaining(".pdf"),
      "file:///printed.pdf",
    ]);
  });

  it("falls back to legacy deletion when the printed File wrapper cannot be constructed", async () => {
    mockFileConstructorErrors.add("file:///printed.pdf");

    await expect(createSketchpadPdf({ pad, drawings: [drawing] })).rejects.toThrow(
      "Could not construct file:///printed.pdf",
    );

    expect(mockCopies).toHaveLength(0);
    expect(mockDeletes).toEqual([expect.stringContaining(".pdf")]);
    expect(mockLegacyDeletes).toEqual(["file:///printed.pdf"]);
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
