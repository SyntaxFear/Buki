import {
  Blur,
  Canvas,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Rect,
} from "@shopify/react-native-skia";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CaptureReview,
  type CaptureReviewCandidate,
} from "@/components/capture-review";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { NativeToolbarButton } from "@/components/native-toolbar-button";
import {
  activeDrawingsOf,
  activePadOf,
  useDrawings,
  type PendingDrawing,
} from "@/store/drawings";
import { colors } from "@/theme";
import {
  discardProcessedCutout,
  discardReviewCutout,
  finalizeReviewCutout,
} from "@/utils/capture-review-media";
import type { CaptureReviewSource } from "@/utils/capture-review";
import { Haptics, impactHaptic } from "@/utils/haptics";
import { getCachedImage, preloadCachedImage } from "@/utils/image-cache";
import { containImageRect } from "@/utils/image-fit";
import { processPhotoForReview, resolveAssetUri } from "@/utils/imageio";
import {
  MAX_SAFE_IMAGE_BYTES,
  MAX_SAFE_IMAGE_EDGE,
  MAX_SAFE_IMAGE_PIXELS,
} from "@/utils/image-safety";
import { SAMPLE_PHOTOS } from "@/utils/samples";

type Phase = "aim" | "processing" | "review" | "accepting" | "glow" | "handoff";

interface ReviewSession {
  candidate: CaptureReviewCandidate;
  source: CaptureReviewSource;
  sourceUri: string;
}

const WHITE_MATRIX = [
  0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
];

export function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const pad = useDrawings(activePadOf);
  const drawings = useDrawings(activeDrawingsOf);
  const setPending = useDrawings((s) => s.setPending);
  const requestArtworkCreation = useDrawings((s) => s.requestArtworkCreation);

  const isDevice = Device.isDevice;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>("aim");
  const [sampleIdx, setSampleIdx] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [review, setReview] = useState<ReviewSession | null>(null);
  const [glowPhotoUri, setGlowPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<PendingDrawing | null>(null);
  const reviewRef = useRef<CaptureReviewCandidate | null>(null);
  const finalResultRef = useRef<PendingDrawing | null>(null);
  const navigatedRef = useRef(false);
  const mountedRef = useRef(true);
  const processRunRef = useRef(0);
  const acceptRunRef = useRef(0);
  const captureRunRef = useRef(0);
  const captureInFlightRef = useRef(false);
  const demoPhoto = SAMPLE_PHOTOS[sampleIdx];
  const demoPhotoSource = Image.resolveAssetSource(demoPhoto);
  const demoPhotoRect = containImageRect(
    demoPhotoSource.width,
    demoPhotoSource.height,
    W,
    H,
  );

  useEffect(
    () => () => {
      mountedRef.current = false;
      captureRunRef.current += 1;
      processRunRef.current += 1;
      acceptRunRef.current += 1;
      discardReviewCutout(reviewRef.current);
      discardProcessedCutout(finalResultRef.current);
    },
    [],
  );

  // Single-shot: after the glow has played, hand the accepted cutout to Home
  // exactly once. Clearing the local ownership ref prevents route cleanup from
  // deleting media that Home now owns.
  useEffect(() => {
    if (phase !== "glow" || !result) return;
    const t = setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      setPhase("handoff");
      setPending(result);
      finalResultRef.current = null;
      router.dismissTo("/");
    }, 1250);
    return () => clearTimeout(t);
  }, [phase, result, setPending, router]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 1800);
  };

  const clearReview = () => {
    discardReviewCutout(reviewRef.current);
    reviewRef.current = null;
    setReview(null);
  };

  const process = async (uri: string, source: CaptureReviewSource) => {
    if (!requestArtworkCreation("artwork_limit")) return;
    const run = ++processRunRef.current;
    setPhase("processing");
    let prepared: CaptureReviewCandidate | null = null;
    try {
      // Let the busy state paint before the pixel crunch
      await new Promise((r) => setTimeout(r, 40));
      const cutout = await processPhotoForReview(uri);
      if (!mountedRef.current || run !== processRunRef.current) {
        discardReviewCutout(cutout);
        return;
      }
      if (!cutout) {
        showNotice("No drawing found — try again");
        setPhase("aim");
        return;
      }
      prepared = {
        ...cutout,
        rotation: (Math.random() - 0.5) * 10,
      };
      reviewRef.current = prepared;
      await preloadCachedImage(prepared.uri);
      if (!mountedRef.current || run !== processRunRef.current) {
        discardReviewCutout(prepared);
        if (reviewRef.current === prepared) reviewRef.current = null;
        return;
      }
      impactHaptic(Haptics.ImpactFeedbackStyle.Light);
      setReview({ candidate: prepared, source, sourceUri: uri });
      setPhase("review");
    } catch (e) {
      discardReviewCutout(prepared);
      if (reviewRef.current === prepared) reviewRef.current = null;
      console.warn("Scan failed", e);
      if (mountedRef.current && run === processRunRef.current) {
        showNotice("Could not read that photo");
        setPhase("aim");
      }
    }
  };

  const askForCamera = () => {
    if (permission?.canAskAgain) {
      requestPermission();
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const shoot = async () => {
    if (phase !== "aim" || captureInFlightRef.current) return;
    if (!requestArtworkCreation("artwork_limit")) return;
    if (isDevice) {
      if (!permission?.granted) {
        askForCamera();
        return;
      }
      if (!cameraReady || !cameraRef.current) return;
    }

    const run = ++captureRunRef.current;
    captureInFlightRef.current = true;
    setPhase("processing");
    try {
      const uri = isDevice
        ? (
            await cameraRef.current?.takePictureAsync({
              quality: 0.85,
            })
          )?.uri
        : await resolveAssetUri(SAMPLE_PHOTOS[sampleIdx]);
      if (!mountedRef.current || run !== captureRunRef.current) return;
      if (!uri) {
        setPhase("aim");
        return;
      }
      void process(uri, isDevice ? "camera" : "demo");
    } catch (error) {
      console.warn("Could not capture photo", error);
      if (mountedRef.current && run === captureRunRef.current) {
        showNotice("Could not capture that photo");
        setPhase("aim");
      }
    } finally {
      if (run === captureRunRef.current) {
        captureInFlightRef.current = false;
      }
    }
  };

  const chooseFromGallery = async () => {
    if (!requestArtworkCreation("artwork_limit")) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    const asset = picked.assets?.[0];
    if (
      asset &&
      ((asset.fileSize !== undefined &&
        asset.fileSize > MAX_SAFE_IMAGE_BYTES) ||
        asset.width > MAX_SAFE_IMAGE_EDGE ||
        asset.height > MAX_SAFE_IMAGE_EDGE ||
        asset.width * asset.height > MAX_SAFE_IMAGE_PIXELS)
    ) {
      showNotice("That photo is too large to import safely");
      return;
    }
    const uri = asset?.uri;
    if (uri) void process(uri, "gallery");
  };

  const pickOrCycle = async () => {
    if (phase !== "aim") return;
    if (!isDevice) {
      setSampleIdx((i) => (i + 1) % SAMPLE_PHOTOS.length);
      return;
    }
    await chooseFromGallery();
  };

  const acceptReview = async () => {
    if (phase !== "review" || !review) return;
    const run = ++acceptRunRef.current;
    setPhase("accepting");
    try {
      const finalized = await finalizeReviewCutout(review.candidate);
      reviewRef.current = null;
      if (!mountedRef.current || run !== acceptRunRef.current) {
        discardProcessedCutout(finalized);
        return;
      }
      const pending: PendingDrawing = {
        ...finalized,
        rotation: review.candidate.rotation,
      };
      const acceptedPhotoUri = finalized.photoUri ?? review.sourceUri;
      finalResultRef.current = pending;
      await Promise.all([
        preloadCachedImage(pending.uri),
        preloadCachedImage(acceptedPhotoUri),
      ]);
      if (!mountedRef.current || run !== acceptRunRef.current) {
        discardProcessedCutout(pending);
        if (finalResultRef.current === pending) finalResultRef.current = null;
        return;
      }
      setGlowPhotoUri(acceptedPhotoUri);
      setResult(pending);
      setPhase("glow");
      setReview(null);
    } catch (error) {
      console.warn("Could not add reviewed drawing", error);
      if (mountedRef.current && run === acceptRunRef.current) {
        showNotice("Could not add that drawing — try again");
        setPhase("review");
      }
    }
  };

  const retakeReview = () => {
    if (!review || phase === "accepting") return;
    const source = review.source;
    clearReview();
    setCameraReady(false);
    setPhase("aim");
    if (source === "gallery") {
      requestAnimationFrame(() => void chooseFromGallery());
    } else if (source === "demo") {
      setSampleIdx((i) => (i + 1) % SAMPLE_PHOTOS.length);
    }
  };

  const deleteReview = () => {
    if (phase === "accepting") return;
    clearReview();
    router.dismissTo("/");
  };

  if (review && pad && (phase === "review" || phase === "accepting")) {
    return (
      <View style={styles.root}>
        <CaptureReview
          pad={pad}
          drawings={drawings}
          candidate={review.candidate}
          source={review.source}
          accepting={phase === "accepting"}
          onAccept={() => void acceptReview()}
          onRetake={retakeReview}
          onDelete={deleteReview}
        />
        {notice ? (
          <View style={[styles.noticeChip, { top: insets.top + 14 }]}>
            <Text style={styles.demoChipText}>{notice}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {phase !== "glow" && phase !== "handoff" ? (
        isDevice ? (
          permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              onCameraReady={() => setCameraReady(true)}
            />
          ) : (
            <View style={styles.deniedRoot}>
              <SymbolView name="camera.fill" size={38} tintColor="#8A8378" />
              <Text style={styles.deniedTitle}>Scan a drawing</Text>
              <Text style={styles.deniedBody}>
                Continue to choose whether Buki can use the camera, or import a
                photo with the gallery button below.
              </Text>
              <Pressable
                onPress={askForCamera}
                accessibilityRole="button"
                accessibilityLabel={
                  permission?.canAskAgain ? "Continue" : "Open Settings"
                }
                style={({ pressed }) => [
                  styles.deniedBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.deniedBtnText}>
                  {permission?.canAskAgain ? "Continue" : "Open Settings"}
                </Text>
              </Pressable>
            </View>
          )
        ) : (
          <Image
            source={demoPhoto}
            style={{
              position: "absolute",
              left: demoPhotoRect.x,
              top: demoPhotoRect.y,
              width: demoPhotoRect.width,
              height: demoPhotoRect.height,
            }}
            resizeMode="stretch"
          />
        )
      ) : null}

      {!isDevice && phase === "aim" ? (
        <View style={[styles.demoChip, { top: insets.top + 14 }]}>
          <Text style={styles.demoChipText}>
            Sample drawing — the gallery button switches it
          </Text>
        </View>
      ) : null}

      {phase === "glow" && glowPhotoUri && result ? (
        <GlowOverlay
          photoUri={glowPhotoUri}
          result={result}
          width={W}
          height={H}
        />
      ) : null}

      {phase === "processing" ? (
        <View style={styles.busy}>
          <ActivityIndicator size="small" color="#FFF7EE" />
        </View>
      ) : null}

      {notice ? (
        <View style={[styles.noticeChip, { top: insets.top + 14 }]}>
          <Text style={styles.demoChipText}>{notice}</Text>
        </View>
      ) : null}

      {phase === "aim" ? (
        <View style={[styles.controls, { bottom: insets.bottom + 22 }]}>
          <NativeToolbarButton
            onPress={pickOrCycle}
            label={
              isDevice
                ? "Choose a drawing from photos"
                : "Show another sample drawing"
            }
            icon="photo.on.rectangle"
            variant="prominent"
            size="large"
            tintColor={colors.tabTeal}
            foregroundColor="#F2FBF9"
            fallbackColor="rgba(72,198,183,0.84)"
            testID="camera-gallery-button"
          />
          <Pressable
            onPress={() => void shoot()}
            disabled={isDevice && Boolean(permission?.granted) && !cameraReady}
            accessibilityRole="button"
            accessibilityLabel="Capture drawing"
            accessibilityState={{
              disabled:
                isDevice && Boolean(permission?.granted) && !cameraReady,
            }}
            style={({ pressed }) => [
              styles.shutterOuter,
              isDevice &&
                Boolean(permission?.granted) &&
                !cameraReady &&
                styles.shutterDisabled,
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <NativeToolbarButton
            onPress={() => router.back()}
            label="Close camera"
            icon="xmark"
            variant="prominent"
            size="large"
            tintColor="#28221C"
            foregroundColor="#F5F2ED"
            fallbackColor="rgba(40,34,28,0.65)"
            testID="camera-close-button"
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The capture-magic moment: the frozen photo dims and blurs away while the
 * detected drawing glows white exactly where it sits on the paper.
 */
function GlowOverlay({
  photoUri,
  result,
  width,
  height,
}: {
  photoUri: string;
  result: PendingDrawing;
  width: number;
  height: number;
}) {
  const photo = getCachedImage(photoUri);
  const cutout = getCachedImage(result.uri);
  const blur = useSharedValue(0);
  const dim = useSharedValue(0);
  const pulse = useSharedValue(1);

  const photoRect = containImageRect(
    result.sourceWidth,
    result.sourceHeight,
    width,
    height,
  );
  const glowRect = {
    x: photoRect.x + result.inkBox.x * photoRect.scale,
    y: photoRect.y + result.inkBox.y * photoRect.scale,
    width: result.inkBox.w * photoRect.scale,
    height: result.inkBox.h * photoRect.scale,
  };

  useEffect(() => {
    blur.value = withTiming(16, { duration: 480 });
    dim.value = withTiming(1, { duration: 480 });
    pulse.value = withDelay(
      120,
      withSpring(1.05, { damping: 7, stiffness: 160 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dimOpacity = useDerivedValue(() => dim.value * 0.42);
  const pulseTransform = useDerivedValue(() => [{ scale: pulse.value }]);
  const glowCenter = {
    x: glowRect.x + glowRect.width / 2,
    y: glowRect.y + glowRect.height / 2,
  };

  if (!photo || !cutout) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <SkiaImage image={photo} rect={photoRect} fit="fill">
        <Blur blur={blur} />
      </SkiaImage>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        color="#2A2119"
        opacity={dimOpacity}
      />
      <Group transform={pulseTransform} origin={glowCenter}>
        <SkiaImage image={cutout} rect={glowRect} fit="fill">
          <ColorMatrix matrix={WHITE_MATRIX} />
        </SkiaImage>
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  deniedRoot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#14272B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 44,
    gap: 12,
  },
  deniedTitle: {
    color: "#F5F2ED",
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  deniedBody: {
    color: "#B9B2A6",
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: "center",
  },
  deniedBtn: {
    marginTop: 10,
    backgroundColor: colors.fab,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  deniedBtnText: {
    color: "#FFF7EE",
    fontSize: 15.5,
    fontWeight: "700",
  },
  root: {
    flex: 1,
    backgroundColor: "#122428",
  },
  demoChip: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(20,39,43,0.76)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  noticeChip: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(217,87,70,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  demoChipText: {
    color: "#FFF7EE",
    fontSize: 13,
    fontFamily: "PatrickHand",
  },
  busy: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 34,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  shutterDisabled: {
    opacity: 0.45,
  },
});
