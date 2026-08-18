const mockFiles = new Set<string>();
const mockDirectories = new Set<string>(["file:///cache", "file:///documents"]);
let mockCopyFailureSource: string | null = null;

function mockJoinedUri(parts: unknown[]): string {
  const values = parts.map((part) =>
    typeof part === "string"
      ? part
      : ((part as { uri?: string }).uri ?? String(part)),
  );
  if (values.length <= 1) return values[0] ?? "";
  return [values[0].replace(/\/+$/, ""), ...values.slice(1)]
    .map((value, index) =>
      index === 0 ? value : value.replace(/^\/+|\/+$/g, ""),
    )
    .join("/");
}

jest.mock("expo-file-system", () => ({
  Paths: {
    cache: { uri: "file:///cache" },
    document: { uri: "file:///documents" },
  },
  Directory: class MockDirectory {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      this.uri = mockJoinedUri(parts);
    }

    get exists() {
      return mockDirectories.has(this.uri);
    }

    create() {
      mockDirectories.add(this.uri);
    }
  },
  File: class MockFile {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      this.uri = mockJoinedUri(parts);
    }

    get exists() {
      return mockFiles.has(this.uri);
    }

    async copy(destination: { uri: string }) {
      await Promise.resolve();
      if (!mockFiles.has(this.uri)) throw new Error("source missing");
      if (mockCopyFailureSource === this.uri) throw new Error("copy failed");
      mockFiles.add(destination.uri);
    }

    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));

import {
  discardReviewCutout,
  finalizeReviewCutout,
  preserveReviewPhoto,
  type ReviewCutout,
} from "./capture-review-media";

function reviewCutout(withPhoto = true): ReviewCutout {
  const review: ReviewCutout = {
    storage: "review",
    uri: "file:///cache/buki-capture-review/drawing-review.png",
    width: 320,
    height: 240,
    inkBox: { x: 0, y: 0, w: 320, h: 240 },
    paperBox: { x: 0, y: 0, w: 320, h: 240 },
    sourceWidth: 320,
    sourceHeight: 240,
    photoUri: withPhoto
      ? "file:///cache/buki-capture-review/photo-review.jpg"
      : undefined,
  };
  mockFiles.add(review.uri);
  if (review.photoUri) mockFiles.add(review.photoUri);
  return review;
}

describe("capture review media ownership", () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDirectories.clear();
    mockDirectories.add("file:///cache");
    mockDirectories.add("file:///documents");
    mockCopyFailureSource = null;
  });

  it("promotes accepted review media and removes the temporary copies", async () => {
    const review = reviewCutout();

    const processed = await finalizeReviewCutout(review);

    expect(processed.storage).toBe("permanent");
    expect(processed.uri).toMatch(/^file:\/\/\/documents\/drawings\/drawing-/);
    expect(processed.photoUri).toMatch(/^file:\/\/\/documents\/photos\/photo-/);
    expect(mockFiles.has(processed.uri)).toBe(true);
    expect(mockFiles.has(processed.photoUri!)).toBe(true);
    expect(mockFiles.has(review.uri)).toBe(false);
    expect(mockFiles.has(review.photoUri!)).toBe(false);
  });

  it("awaits a sanitized photo copy before deleting its temporary source", async () => {
    const source = new (require("expo-file-system").File)(
      "file:///cache/sanitized-photo.jpg",
    );
    const destination = new (require("expo-file-system").File)(
      "file:///cache/buki-capture-review/photo-review.jpg",
    );
    mockFiles.add(source.uri);

    await preserveReviewPhoto(source, destination);

    expect(mockFiles.has(source.uri)).toBe(false);
    expect(mockFiles.has(destination.uri)).toBe(true);
  });

  it("keeps review media retryable and removes partial permanent copies when promotion fails", async () => {
    const review = reviewCutout();
    mockCopyFailureSource = review.photoUri!;

    await expect(finalizeReviewCutout(review)).rejects.toThrow("copy failed");

    expect(mockFiles.has(review.uri)).toBe(true);
    expect(mockFiles.has(review.photoUri!)).toBe(true);
    expect(
      [...mockFiles].some((uri) => uri.startsWith("file:///documents/")),
    ).toBe(false);
  });

  it("discards unaccepted review media idempotently", () => {
    const review = reviewCutout();

    discardReviewCutout(review);
    discardReviewCutout(review);

    expect(mockFiles.has(review.uri)).toBe(false);
    expect(mockFiles.has(review.photoUri!)).toBe(false);
  });
});
