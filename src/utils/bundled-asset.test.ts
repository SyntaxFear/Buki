const mockCopy = jest.fn();
const mockDownload = jest.fn();
let mockAsset: {
  localUri: string | null;
  hash: string | null;
  type: string;
  downloadAsync: typeof mockDownload;
};

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: jest.fn(() => mockAsset),
  },
}));

jest.mock("expo-file-system", () => {
  const cache = { uri: "file:///cache/" };
  return {
    Paths: { cache },
    File: class MockFile {
      readonly uri: string;

      constructor(root: string | { uri: string }, name?: string) {
        this.uri =
          typeof root === "string"
            ? root
            : `${root.uri}${name ?? ""}`;
      }

      copy(destination: { uri: string }, options: { overwrite: boolean }) {
        return mockCopy(this.uri, destination.uri, options);
      }
    },
  };
});

import { resolveBundledAssetUri } from "./bundled-asset";

describe("resolveBundledAssetUri", () => {
  beforeEach(() => {
    mockCopy.mockReset().mockResolvedValue(undefined);
    mockDownload.mockReset().mockResolvedValue(undefined);
    mockAsset = {
      localUri: "file:///cache/existing.jpg",
      hash: "abc123",
      type: "jpg",
      downloadAsync: mockDownload,
    };
  });

  it("reuses assets that Expo already placed in cache", async () => {
    await expect(resolveBundledAssetUri(7)).resolves.toBe(
      "file:///cache/existing.jpg",
    );
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it("stages release assets from the read-only app bundle", async () => {
    mockAsset.localUri = "file:///Buki.app/assets/sample-boat.jpg";

    await expect(resolveBundledAssetUri(7)).resolves.toBe(
      "file:///cache/buki-bundled-abc123.jpg",
    );
    expect(mockCopy).toHaveBeenCalledWith(
      "file:///Buki.app/assets/sample-boat.jpg",
      "file:///cache/buki-bundled-abc123.jpg",
      { overwrite: true },
    );
  });

  it("downloads unresolved assets before returning their cache URI", async () => {
    mockAsset.localUri = null;
    mockDownload.mockImplementation(async () => {
      mockAsset.localUri = "file:///cache/downloaded.jpg";
    });

    await expect(resolveBundledAssetUri(7)).resolves.toBe(
      "file:///cache/downloaded.jpg",
    );
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });
});
