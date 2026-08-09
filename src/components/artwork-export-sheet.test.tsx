import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockFiles = new Map<string, Uint8Array>();
const mockShareAsync = jest.fn();
const mockCreateAsset = jest.fn();
const mockConfirmAdult = jest.fn(async (_message?: string) => true);

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: (...args: unknown[]) => mockCreateAsset(...args) },
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));
jest.mock("react-native-view-shot", () => ({
  __esModule: true,
  default: "ViewShot",
  captureRef: jest.fn(),
  releaseCapture: jest.fn(),
}));
jest.mock("@/export/export-access", () => ({ requireExportAccess: jest.fn() }));
jest.mock("@/store/parental-gate", () => ({
  confirmAdult: (message: string) => mockConfirmAdult(message),
}));
jest.mock("@/store/auth", () => ({
  useAuth: (selector: (state: { user: { id: string } }) => unknown) => selector({
    user: { id: "adult-a" },
  }),
}));
jest.mock("@/analytics/client", () => ({ trackAnalyticsEvent: jest.fn() }));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache://exports" },
  File: class MockFile {
    readonly uri: string;

    constructor(...parts: unknown[]) {
      const [first, ...rest] = parts;
      const base = typeof first === "string"
        ? first.replace(/\/$/, "")
        : String((first as { uri?: string } | undefined)?.uri ?? first).replace(/\/$/, "");
      this.uri = [base, ...rest.map((part) => String(part).replace(/^\/+|\/+$/g, ""))]
        .filter(Boolean)
        .join("/");
    }

    get exists(): boolean {
      return mockFiles.has(this.uri);
    }

    async copy(destination: MockFile): Promise<void> {
      const bytes = mockFiles.get(this.uri);
      if (!bytes) throw new Error(`Missing ${this.uri}`);
      mockFiles.set(destination.uri, Uint8Array.from(bytes));
    }

    delete(): void {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: async (uri: string) => {
    mockFiles.delete(uri);
  },
}));

import type { Drawing } from "@/store/migrate";
import { ArtworkExportSheet } from "./artwork-export-sheet";

const drawing: Drawing = {
  id: "art-a",
  uri: "file:///art-a.png",
  width: 100,
  height: 120,
  rotation: 0,
  addedAt: 1_700_000_000_000,
  title: "Verifier Art",
};
const destination = "cache://exports/buki-verifier-art-2023-11-14.png";

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("ArtworkExportSheet temporary files", () => {
  beforeEach(() => {
    mockFiles.clear();
    mockFiles.set(drawing.uri, new Uint8Array([1, 2, 3]));
    mockShareAsync.mockReset().mockResolvedValue(undefined);
    mockCreateAsset.mockReset().mockResolvedValue({ id: "asset-a" });
    mockConfirmAdult.mockClear();
  });

  async function renderPngSheet(): Promise<TestRenderer.ReactTestRenderer> {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ArtworkExportSheet
          visible
          drawing={drawing}
          padName="Verifier Book"
          childName="Ava"
          onClose={jest.fn()}
        />,
      );
      await settle();
    });
    const png = renderer.root.findByProps({ accessibilityLabel: "PNG, Transparent cutout" });
    await act(async () => {
      png.props.onPress();
      await settle();
    });
    return renderer;
  }

  it("removes the cached destination after sharing completes", async () => {
    const renderer = await renderPngSheet();
    const share = renderer.root.findByProps({ accessibilityLabel: "Share PNG artwork export" });
    await act(async () => {
      share.props.onPress();
      await settle();
    });

    expect(mockShareAsync).toHaveBeenCalledWith(destination, expect.any(Object));
    expect(mockFiles.has(destination)).toBe(false);
  });

  it("removes the cached destination after saving to Photos completes", async () => {
    const renderer = await renderPngSheet();
    const save = renderer.root.findByProps({
      accessibilityLabel: "Save PNG artwork export to Photos",
    });
    await act(async () => {
      save.props.onPress();
      await settle();
    });

    expect(mockCreateAsset).toHaveBeenCalledWith(destination);
    expect(mockFiles.has(destination)).toBe(false);
  });
});
