import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockBytesSync = jest.fn((_uri: string) => Uint8Array.from([1, 2, 3]));
const mockFromBytes = jest.fn((bytes: Uint8Array) => bytes);
const mockMakeImage = jest.fn((_data: unknown): unknown => null);

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    readonly mockUri: string;

    constructor(input: string) {
      this.mockUri = input;
    }

    bytesSync() {
      return mockBytesSync(this.mockUri);
    }
  },
}));

jest.mock("@shopify/react-native-skia", () => ({
  Skia: {
    Data: { fromBytes: (bytes: Uint8Array) => mockFromBytes(bytes) },
    Image: {
      MakeImageFromEncoded: (data: unknown) => mockMakeImage(data),
    },
  },
}));

import {
  getCachedImage,
  preloadCachedImage,
  useImageCache,
} from "./image-cache";

describe("drawing image cache", () => {
  beforeEach(() => {
    mockBytesSync.mockClear();
    mockFromBytes.mockClear();
    mockMakeImage.mockReset();
  });

  it("shares an in-flight preload and exposes the decoded image synchronously", async () => {
    const image = { id: "landing-image" };
    mockMakeImage.mockReturnValue(image);

    const first = preloadCachedImage("file:///landing.png");
    const second = preloadCachedImage("file:///landing.png");

    await expect(first).resolves.toBe(image);
    await expect(second).resolves.toBe(image);
    expect(mockBytesSync).toHaveBeenCalledTimes(1);
    expect(mockMakeImage).toHaveBeenCalledTimes(1);
    expect(getCachedImage("file:///landing.png")).toBe(image);
  });

  it("allows a later render to retry when native decoding returns no image", async () => {
    const image = { id: "retry-image" };
    mockMakeImage.mockReturnValueOnce(null).mockReturnValueOnce(image);

    await expect(preloadCachedImage("file:///retry.png")).resolves.toBeNull();
    await expect(preloadCachedImage("file:///retry.png")).resolves.toBe(image);
    expect(mockBytesSync).toHaveBeenCalledTimes(2);
  });

  it("does not rerender a visible page when only a warm neighbor finishes decoding", async () => {
    const revisions: number[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    function CacheProbe() {
      const state = useImageCache(["file:///visible-page.png"], []);
      revisions.push(state.revision);
      return null;
    }

    mockMakeImage.mockImplementation(() => ({ id: "decoded-image" }));

    act(() => {
      renderer = TestRenderer.create(React.createElement(CacheProbe));
    });

    await act(async () => {
      await preloadCachedImage("file:///warm-neighbor.png");
    });
    expect(revisions.at(-1)).toBe(0);

    await act(async () => {
      await preloadCachedImage("file:///visible-page.png");
    });
    expect(revisions.at(-1)).toBe(1);

    act(() => renderer.unmount());
  });
});
