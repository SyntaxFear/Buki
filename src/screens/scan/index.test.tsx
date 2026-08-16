import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockSetPending = jest.fn();
const mockRequestArtworkCreation = jest.fn(() => true);
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
const mockProcessPhotoForReview = jest.fn();
const mockResolveAssetUri = jest.fn(
  async (_asset: number) => "file:///demo-source.jpg",
);
const mockPreloadCachedImage = jest.fn(async (_uri: string) => ({
  image: true,
}));
const mockGetCachedImage = jest.fn((_uri: string) => ({ image: true }));
const mockFinalizeReviewCutout = jest.fn();
const mockDiscardReviewCutout = jest.fn();
const mockDiscardProcessedCutout = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockTakePictureAsync = jest.fn();
let mockIsDevice = false;

const mockPad = {
  id: "pad-a",
  childId: "child-a",
  name: "My Book",
  style: "vertical" as const,
  design: "sunshine" as const,
  border: "none" as const,
  decoration: "none" as const,
  coverColor: "#4A79D8",
  pageColor: "#FFFDF4",
  createdAt: 1,
};

const mockDrawingState = {
  pads: [mockPad],
  activePadId: mockPad.id,
  drawingsByPad: { [mockPad.id]: [] },
  setPending: mockSetPending,
  requestArtworkCreation: mockRequestArtworkCreation,
};

jest.mock("@shopify/react-native-skia", () => ({
  Blur: "Blur",
  Canvas: "Canvas",
  ColorMatrix: "ColorMatrix",
  Group: "Group",
  Image: "SkiaImage",
  Rect: "Rect",
  useImage: jest.fn(() => ({ image: true })),
}));

jest.mock("expo-camera", () => {
  const mockReact = require("react") as typeof React;
  const MockCameraView = mockReact.forwardRef(
    function MockCameraView(props: object, ref: React.ForwardedRef<unknown>) {
      mockReact.useImperativeHandle(ref, () => ({
        takePictureAsync: (...args: unknown[]) =>
          mockTakePictureAsync(...args),
      }));
      return mockReact.createElement("CameraView", props);
    },
  );
  return {
    CameraView: MockCameraView,
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true },
      jest.fn(),
    ],
  };
});

jest.mock("expo-device", () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) =>
    mockLaunchImageLibraryAsync(...args),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, back: mockBack }),
}));

jest.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("react-native-reanimated", () => ({
  useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
  useSharedValue: (value: unknown) => ({ value }),
  withDelay: (_delay: number, value: unknown) => value,
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

jest.mock("@/components/glass", () => ({ Glass: "Glass" }));

jest.mock("@/components/capture-review", () => {
  const mockReact = require("react") as typeof React;
  return {
    CaptureReview: (props: unknown) =>
      mockReact.createElement("CaptureReview", props as object),
  };
});

jest.mock("@/store/drawings", () => ({
  activePadOf: (state: typeof mockDrawingState) =>
    state.pads.find((pad) => pad.id === state.activePadId),
  activeDrawingsOf: (state: typeof mockDrawingState) =>
    state.drawingsByPad[state.activePadId] ?? [],
  useDrawings: (selector: (state: typeof mockDrawingState) => unknown) =>
    selector(mockDrawingState),
}));

jest.mock("@/utils/capture-review-media", () => ({
  discardProcessedCutout: (...args: unknown[]) =>
    mockDiscardProcessedCutout(...args),
  discardReviewCutout: (...args: unknown[]) => mockDiscardReviewCutout(...args),
  finalizeReviewCutout: (...args: unknown[]) =>
    mockFinalizeReviewCutout(...args),
}));

jest.mock("@/utils/haptics", () => ({
  Haptics: {
    ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
    NotificationFeedbackType: {
      Error: "error",
      Success: "success",
      Warning: "warning",
    },
  },
  impactHaptic: jest.fn(),
  notificationHaptic: jest.fn(),
  selectionHaptic: jest.fn(),
}));

jest.mock("@/utils/image-cache", () => ({
  getCachedImage: (uri: string) => mockGetCachedImage(uri),
  preloadCachedImage: (uri: string) => mockPreloadCachedImage(uri),
}));

jest.mock("@/utils/imageio", () => ({
  processPhotoForReview: (uri: string) => mockProcessPhotoForReview(uri),
  resolveAssetUri: (asset: number) => mockResolveAssetUri(asset),
}));

jest.mock("@/utils/samples", () => ({ SAMPLE_PHOTOS: [1, 2] }));

import { Scan } from "./index";

const CaptureReviewHost = "CaptureReview" as unknown as React.ElementType;
const CameraViewHost = "CameraView" as unknown as React.ElementType;

const reviewCutout = {
  storage: "review" as const,
  uri: "file:///cache/review-cutout.png",
  photoUri: "file:///cache/review-photo.jpg",
  width: 120,
  height: 90,
  inkBox: { x: 0, y: 0, w: 120, h: 90 },
  paperBox: { x: 0, y: 0, w: 120, h: 90 },
  sourceWidth: 120,
  sourceHeight: 90,
};

const finalizedCutout = {
  ...reviewCutout,
  storage: "permanent" as const,
  uri: "file:///documents/drawing.png",
  photoUri: "file:///documents/photo.jpg",
};

async function flushProcessing(): Promise<void> {
  await Promise.resolve();
  jest.advanceTimersByTime(45);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Scan capture review flow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIsDevice = false;
    mockSetPending.mockReset();
    mockRequestArtworkCreation.mockReset().mockReturnValue(true);
    mockDismissTo.mockReset();
    mockBack.mockReset();
    mockProcessPhotoForReview.mockReset().mockResolvedValue(reviewCutout);
    mockResolveAssetUri
      .mockReset()
      .mockResolvedValue("file:///demo-source.jpg");
    mockPreloadCachedImage.mockReset().mockResolvedValue({ image: true });
    mockGetCachedImage.mockReset().mockReturnValue({ image: true });
    mockFinalizeReviewCutout.mockReset().mockResolvedValue(finalizedCutout);
    mockDiscardReviewCutout.mockReset();
    mockDiscardProcessedCutout.mockReset();
    mockLaunchImageLibraryAsync.mockReset();
    mockTakePictureAsync
      .mockReset()
      .mockResolvedValue({ uri: "file:///camera.jpg" });
    jest.spyOn(Math, "random").mockReturnValue(0.9);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("stops a capture at review without saving automatically", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });

    await act(async () => {
      await renderer.root
        .findByProps({
          accessibilityLabel: "Capture drawing",
        })
        .props.onPress();
      await flushProcessing();
    });

    const review = renderer.root.findByType(CaptureReviewHost);
    expect(review.props.source).toBe("demo");
    expect(review.props.candidate.rotation).toBeCloseTo(4);
    expect(mockSetPending).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it("promotes and hands off an accepted drawing exactly once", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });
    await act(async () => {
      await renderer.root
        .findByProps({
          accessibilityLabel: "Capture drawing",
        })
        .props.onPress();
      await flushProcessing();
    });

    await act(async () => {
      renderer.root.findByType(CaptureReviewHost).props.onAccept();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFinalizeReviewCutout).toHaveBeenCalledTimes(1);
    expect(mockPreloadCachedImage).toHaveBeenCalledWith(finalizedCutout.uri);
    expect(mockPreloadCachedImage).toHaveBeenCalledWith(
      finalizedCutout.photoUri,
    );
    expect(mockSetPending).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1_300);
    });

    expect(mockSetPending).toHaveBeenCalledTimes(1);
    expect(mockSetPending).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: finalizedCutout.uri,
        rotation: 4,
      }),
    );
    expect(mockDismissTo).toHaveBeenCalledWith("/");

    act(() => renderer.unmount());
    expect(mockDiscardProcessedCutout).not.toHaveBeenCalledWith(
      expect.objectContaining({ uri: finalizedCutout.uri }),
    );
  });

  it("does not remount the live camera after an image is accepted", async () => {
    mockIsDevice = true;
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///gallery.jpg",
          width: 800,
          height: 600,
          fileSize: 100_000,
        },
      ],
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });

    await act(async () => {
      await renderer.root
        .findByProps({ accessibilityLabel: "Choose a drawing from photos" })
        .props.onPress();
      await flushProcessing();
    });

    await act(async () => {
      renderer.root.findByType(CaptureReviewHost).props.onAccept();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType(CameraViewHost)).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it("waits for camera readiness and locks rapid duplicate captures", async () => {
    mockIsDevice = true;
    let resolveCapture!: (value: { uri: string }) => void;
    mockTakePictureAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });

    const camera = renderer.root.findByType(CameraViewHost);
    const unreadyShutter = renderer.root.findByProps({
      accessibilityLabel: "Capture drawing",
    });
    expect(unreadyShutter.props.accessibilityState.disabled).toBe(true);
    expect(mockTakePictureAsync).not.toHaveBeenCalled();

    act(() => camera.props.onCameraReady());
    const onPress = renderer.root.findByProps({
      accessibilityLabel: "Capture drawing",
    }).props.onPress;
    await act(async () => {
      onPress();
      onPress();
      expect(mockTakePictureAsync).toHaveBeenCalledTimes(1);
      resolveCapture({ uri: "file:///camera.jpg" });
      await jest.advanceTimersByTimeAsync(45);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findByType(CaptureReviewHost).props.source).toBe(
      "camera",
    );

    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
  });

  it("deletes an unaccepted capture and returns to the sketchpad", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });
    await act(async () => {
      await renderer.root
        .findByProps({
          accessibilityLabel: "Capture drawing",
        })
        .props.onPress();
      await flushProcessing();
    });

    act(() => {
      renderer.root.findByType(CaptureReviewHost).props.onDelete();
    });

    expect(mockDiscardReviewCutout).toHaveBeenCalledWith(
      expect.objectContaining({ uri: reviewCutout.uri }),
    );
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(mockSetPending).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it("reopens the gallery after Choose another", async () => {
    mockIsDevice = true;
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///gallery.jpg",
          width: 800,
          height: 600,
          fileSize: 100_000,
        },
      ],
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });

    await act(async () => {
      await renderer.root
        .findByProps({
          accessibilityLabel: "Choose a drawing from photos",
        })
        .props.onPress();
      await flushProcessing();
    });
    expect(renderer.root.findByType(CaptureReviewHost).props.source).toBe(
      "gallery",
    );

    await act(async () => {
      renderer.root.findByType(CaptureReviewHost).props.onRetake();
      jest.advanceTimersByTime(20);
      await Promise.resolve();
    });

    expect(mockDiscardReviewCutout).toHaveBeenCalledWith(
      expect.objectContaining({ uri: reviewCutout.uri }),
    );
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledTimes(2);

    act(() => renderer.unmount());
  });

  it("discards processing output that completes after unmount", async () => {
    let resolveProcessing!: (value: typeof reviewCutout) => void;
    mockProcessPhotoForReview.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProcessing = resolve;
        }),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: "Capture drawing" })
        .props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(45);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => renderer.unmount());
    await act(async () => {
      resolveProcessing(reviewCutout);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDiscardReviewCutout).toHaveBeenCalledWith(reviewCutout);
    expect(mockSetPending).not.toHaveBeenCalled();
  });

  it("discards finalized media when acceptance completes after unmount", async () => {
    let resolveFinalization!: (value: typeof finalizedCutout) => void;
    mockFinalizeReviewCutout.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFinalization = resolve;
        }),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Scan />);
    });
    await act(async () => {
      await renderer.root
        .findByProps({ accessibilityLabel: "Capture drawing" })
        .props.onPress();
      await flushProcessing();
    });
    act(() => {
      renderer.root.findByType(CaptureReviewHost).props.onAccept();
      renderer.unmount();
    });
    await act(async () => {
      resolveFinalization(finalizedCutout);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDiscardProcessedCutout).toHaveBeenCalledWith(finalizedCutout);
    expect(mockSetPending).not.toHaveBeenCalled();
  });
});
