const mockFiles = new Set<string>();
const mockDeletes: string[] = [];
const mockLegacyDeletes: string[] = [];
const mockConstructorErrors = new Set<string>();
const mockDeleteErrors = new Set<string>();

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
      if (mockConstructorErrors.has(uri)) throw new Error(`Could not construct ${uri}`);
    }

    get exists(): boolean {
      return mockFiles.has(this.uri);
    }

    delete(): void {
      if (mockDeleteErrors.has(this.uri)) throw new Error(`Could not delete ${this.uri}`);
      mockDeletes.push(this.uri);
      mockFiles.delete(this.uri);
    }
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: async (uri: string) => {
    mockLegacyDeletes.push(uri);
    mockFiles.delete(uri);
  },
}));

import { deleteLocalFile } from "./file-cleanup";

describe("deleteLocalFile", () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDeletes.length = 0;
    mockLegacyDeletes.length = 0;
    mockConstructorErrors.clear();
    mockDeleteErrors.clear();
  });

  it("deletes an existing file with the Expo File API", async () => {
    mockFiles.add("file:///cached-export.png");

    await deleteLocalFile("file:///cached-export.png");

    expect(mockDeletes).toEqual(["file:///cached-export.png"]);
    expect(mockLegacyDeletes).toHaveLength(0);
    expect(mockFiles.has("file:///cached-export.png")).toBe(false);
  });

  it("does nothing when the file is already absent", async () => {
    await deleteLocalFile("file:///missing-export.png");

    expect(mockDeletes).toHaveLength(0);
    expect(mockLegacyDeletes).toHaveLength(0);
  });

  it("falls back to legacy deletion when File construction fails", async () => {
    mockFiles.add("file:///native-temp.pdf");
    mockConstructorErrors.add("file:///native-temp.pdf");

    await deleteLocalFile("file:///native-temp.pdf");

    expect(mockLegacyDeletes).toEqual(["file:///native-temp.pdf"]);
    expect(mockFiles.has("file:///native-temp.pdf")).toBe(false);
  });

  it("falls back to legacy deletion when File.delete fails", async () => {
    mockFiles.add("file:///locked-export.zip");
    mockDeleteErrors.add("file:///locked-export.zip");

    await deleteLocalFile("file:///locked-export.zip");

    expect(mockLegacyDeletes).toEqual(["file:///locked-export.zip"]);
    expect(mockFiles.has("file:///locked-export.zip")).toBe(false);
  });
});
