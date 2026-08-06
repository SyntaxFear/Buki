import {
  Blur,
  Canvas,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Rect,
  useImage,
} from "@shopify/react-native-skia";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
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

import { useDrawings } from "@/store/drawings";
import { colors } from "@/theme";
import { processPhotoToCutout, resolveAssetUri, type ProcessedCutout } from "@/utils/imageio";
import { SAMPLE_PHOTOS } from "@/utils/samples";

type Phase = "aim" | "busy" | "glow";

const WHITE_MATRIX = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];

export function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const setPending = useDrawings((s) => s.setPending);

  const isDevice = Device.isDevice;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>("aim");
  const [sampleIdx, setSampleIdx] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedCutout | null>(null);
  const navigatedRef = useRef(false);

  // Single-shot: after the glow has played, hand the cutout to Home exactly once
  useEffect(() => {
    if (phase !== "glow" || !result) return;
    const t = setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      setPending(result);
      router.dismissTo("/");
    }, 1250);
    return () => clearTimeout(t);
  }, [phase, result, setPending, router]);

  useEffect(() => {
    if (isDevice && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [isDevice, permission, requestPermission]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 1800);
  };

  const process = async (uri: string) => {
    setPhase("busy");
    try {
      // Let the busy state paint before the pixel crunch
      await new Promise((r) => setTimeout(r, 40));
      const cutout = await processPhotoToCutout(uri);
      if (!cutout) {
        showNotice("No drawing found — try again");
        setPhase("aim");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPhotoUri(uri);
      setResult(cutout);
      setPhase("glow");
    } catch (e) {
      console.warn("Scan failed", e);
      showNotice("Could not read that photo");
      setPhase("aim");
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
    if (phase !== "aim") return;
    if (isDevice) {
      if (!permission?.granted) {
        askForCamera();
        return;
      }
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) process(photo.uri);
    } else {
      const uri = await resolveAssetUri(SAMPLE_PHOTOS[sampleIdx]);
      process(uri);
    }
  };

  const pickOrCycle = async () => {
    if (phase !== "aim") return;
    if (!isDevice) {
      setSampleIdx((i) => (i + 1) % SAMPLE_PHOTOS.length);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    const uri = picked.assets?.[0]?.uri;
    if (uri) process(uri);
  };

  return (
    <View style={styles.root}>
      {isDevice ? (
        permission?.granted ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          <View style={styles.deniedRoot}>
            <SymbolView name="camera.fill" size={38} tintColor="#8A8378" />
            <Text style={styles.deniedTitle}>Buki needs the camera</Text>
            <Text style={styles.deniedBody}>
              Point it at a drawing and it flies into your book. You can also import a photo with
              the gallery button below.
            </Text>
            <Pressable onPress={askForCamera} style={styles.deniedBtn}>
              <Text style={styles.deniedBtnText}>
                {permission?.canAskAgain ? "Allow camera" : "Open Settings"}
              </Text>
            </Pressable>
          </View>
        )
      ) : (
        <Image source={SAMPLE_PHOTOS[sampleIdx]} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {!isDevice && phase === "aim" ? (
        <View style={[styles.demoChip, { top: insets.top + 14 }]}>
          <Text style={styles.demoChipText}>Demo photo — the gallery button switches it</Text>
        </View>
      ) : null}

      {phase === "glow" && photoUri && result ? (
        <GlowOverlay photoUri={photoUri} result={result} width={W} height={H} />
      ) : null}

      {phase === "busy" ? (
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
          <Pressable onPress={pickOrCycle} style={styles.galleryBtn}>
            <SymbolView name="photo.on.rectangle" size={20} tintColor="#F2FBF9" />
          </Pressable>
          <Pressable onPress={shoot} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <SymbolView name="xmark" size={18} tintColor="#F5F2ED" />
          </Pressable>
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
  result: ProcessedCutout;
  width: number;
  height: number;
}) {
  const photo = useImage(photoUri);
  const cutout = useImage(result.uri);
  const blur = useSharedValue(0);
  const dim = useSharedValue(0);
  const pulse = useSharedValue(1);

  const scale = Math.max(width / result.sourceWidth, height / result.sourceHeight);
  const dw = result.sourceWidth * scale;
  const dh = result.sourceHeight * scale;
  const ox = (width - dw) / 2;
  const oy = (height - dh) / 2;
  const glowRect = {
    x: ox + result.inkBox.x * scale,
    y: oy + result.inkBox.y * scale,
    width: result.inkBox.w * scale,
    height: result.inkBox.h * scale,
  };

  useEffect(() => {
    blur.value = withTiming(16, { duration: 480 });
    dim.value = withTiming(1, { duration: 480 });
    pulse.value = withDelay(120, withSpring(1.05, { damping: 7, stiffness: 160 }));
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
      <SkiaImage image={photo} rect={{ x: ox, y: oy, width: dw, height: dh }} fit="fill">
        <Blur blur={blur} />
      </SkiaImage>
      <Rect x={0} y={0} width={width} height={height} color="#2A2119" opacity={dimOpacity} />
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
    backgroundColor: "#141210",
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
    backgroundColor: "#E8695A",
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
    backgroundColor: "#1C1712",
  },
  demoChip: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(28,23,18,0.72)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  noticeChip: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(190,60,45,0.88)",
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
  galleryBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(94,198,180,0.82)",
    alignItems: "center",
    justifyContent: "center",
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
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(40,34,28,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
});
