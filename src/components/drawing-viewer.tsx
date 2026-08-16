import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { NativeDrawingModePicker } from "@/components/native-drawing-mode-picker";
import { NativeToolbarButton } from "@/components/native-toolbar-button";
import type { Drawing } from "@/store/drawings";
import { fitRect, type Rect } from "@/utils/book-layout";
import {
  clampViewerTransform,
  getDoubleTapViewerTarget,
} from "@/utils/image-viewer-transform";
import { Haptics, impactHaptic } from "@/utils/haptics";

const TRANSFORM_MS = 200;
const SETTLE_MS = 160;

interface Props {
  drawing: Drawing;
  /** The drawing's fitted rect on the page — where the zoom starts and ends */
  originRect: Rect;
  onClose: () => void;
  onOpenDetails: () => void;
  onDelete: () => void;
}

/**
 * Fullscreen viewer: the tapped drawing zooms up from its page spot, can be
 * pinch-zoomed and panned, and — when the original photo was preserved —
 * flipped between the cutout and the real photograph.
 */
export function DrawingViewer({
  drawing,
  originRect,
  onClose,
  onOpenDetails,
  onDelete,
}: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const destRect = fitRect(drawing.width, drawing.height, {
    x: 18,
    y: insets.top + 64,
    width: W - 36,
    height: H - insets.top - 64 - insets.bottom - 130,
  });

  const [mode, setMode] = useState<"drawing" | "photo">("drawing");
  const open = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const photoFade = useSharedValue(0);

  useEffect(() => {
    open.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [open]);

  useEffect(() => {
    photoFade.value = withTiming(mode === "photo" ? 1 : 0, { duration: 240 });
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
    const config = { duration: TRANSFORM_MS, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(1, config);
    tx.value = withTiming(0, config);
    ty.value = withTiming(0, config);
  }, [mode, photoFade, scale, tx, ty]);

  const close = () => {
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
    const config = { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(1, config);
    tx.value = withTiming(0, config);
    ty.value = withTiming(0, config);
    open.value = withTiming(
      0,
      { duration: 280, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  };

  const settleToBounds = () => {
    "worklet";
    const target = clampViewerTransform(
      { scale: scale.value, x: tx.value, y: ty.value },
      { width: destRect.width, height: destRect.height },
    );
    const config = { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(target.scale, config);
    tx.value = withTiming(target.x, config);
    ty.value = withTiming(target.y, config);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      const target = clampViewerTransform(
        {
          scale: savedScale.value * e.scale,
          x: savedTx.value,
          y: savedTy.value,
        },
        { width: destRect.width, height: destRect.height },
      );
      scale.value = target.scale;
      tx.value = target.x;
      ty.value = target.y;
    })
    .onEnd(settleToBounds);

  const pan = Gesture.Pan()
    .onStart(() => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      const target = clampViewerTransform(
        {
          scale: scale.value,
          x: savedTx.value + e.translationX,
          y: savedTy.value + e.translationY,
        },
        { width: destRect.width, height: destRect.height },
      );
      tx.value = target.x;
      ty.value = target.y;
    })
    .onEnd(settleToBounds);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(400)
    .maxDelay(350)
    .maxDistance(16)
    .onEnd((e, success) => {
      if (!success) return;
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      const target = getDoubleTapViewerTarget(
        { scale: scale.value, x: tx.value, y: ty.value },
        { x: e.x, y: e.y },
        { width: destRect.width, height: destRect.height },
      );
      const config = {
        duration: TRANSFORM_MS,
        easing: Easing.out(Easing.cubic),
      };
      scale.value = withTiming(target.scale, config);
      tx.value = withTiming(target.x, config);
      ty.value = withTiming(target.y, config);
      runOnJS(impactHaptic)(Haptics.ImpactFeedbackStyle.Light);
    });

  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: open.value }));

  const imageStyle = useAnimatedStyle(() => {
    const x = interpolate(open.value, [0, 1], [originRect.x, destRect.x]);
    const y = interpolate(open.value, [0, 1], [originRect.y, destRect.y]);
    const w = interpolate(
      open.value,
      [0, 1],
      [originRect.width, destRect.width],
    );
    const h = interpolate(
      open.value,
      [0, 1],
      [originRect.height, destRect.height],
    );
    const rot = interpolate(open.value, [0, 1], [drawing.rotation, 0]);
    return {
      position: "absolute" as const,
      zIndex: 10,
      left: x + tx.value,
      top: y + ty.value,
      width: w,
      height: h,
      transform: [{ rotate: `${rot}deg` }, { scale: scale.value }],
    };
  });

  const drawingOpacity = useAnimatedStyle(() => ({
    opacity: 1 - photoFade.value,
  }));
  const photoOpacity = useAnimatedStyle(() => ({ opacity: photoFade.value }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.7, 1], [0, 0, 1]),
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <GestureDetector gesture={gestures}>
        <Animated.View style={imageStyle}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.drawingCard,
              drawingOpacity,
            ]}
          >
            <Image
              source={{ uri: drawing.uri }}
              style={styles.img}
              contentFit="contain"
              accessible={mode === "drawing"}
              accessibilityLabel="Scanned drawing cutout"
            />
          </Animated.View>
          {drawing.photoUri ? (
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.photoCard, photoOpacity]}
            >
              <Image
                source={{ uri: drawing.photoUri }}
                style={styles.img}
                contentFit="contain"
                accessible={mode === "photo"}
                accessibilityLabel="Original camera photo"
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      <Animated.View
        style={[styles.topBar, { top: insets.top + 8 }, chromeStyle]}
      >
        <NativeToolbarButton
          onPress={onOpenDetails}
          label="Open artwork details"
          icon="info.circle"
          variant="prominent"
          size="large"
          tintColor="#48C6B7"
          foregroundColor="#F2FBF9"
          fallbackColor="rgba(72,198,183,0.84)"
          testID="viewer-details-button"
        />
        <NativeToolbarButton
          onPress={onDelete}
          haptic={false}
          label="Delete artwork"
          hint="Requires grown-up confirmation"
          icon="trash.fill"
          variant="destructive"
          size="large"
          tintColor="#9F352E"
          foregroundColor="#FFF1ED"
          fallbackColor="rgba(159,53,46,0.84)"
          testID="viewer-delete-button"
        />
        <NativeToolbarButton
          onPress={close}
          label="Close image viewer"
          icon="xmark"
          variant="prominent"
          size="large"
          tintColor="#28221C"
          foregroundColor="#F5F2ED"
          fallbackColor="rgba(40,34,28,0.65)"
          testID="viewer-close-button"
        />
      </Animated.View>

      {drawing.photoUri ? (
        <Animated.View
          style={[
            styles.togglePillWrap,
            { bottom: insets.bottom + 30 },
            chromeStyle,
          ]}
        >
          <NativeDrawingModePicker value={mode} onChange={setMode} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 100,
    elevation: 100,
  },
  scrim: {
    zIndex: 0,
    backgroundColor: "rgba(24,20,16,0.82)",
  },
  img: {
    width: "100%",
    height: "100%",
  },
  drawingCard: {
    borderRadius: 14,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  photoCard: {
    borderRadius: 14,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "#0E0C0A",
  },
  topBar: {
    position: "absolute",
    right: 16,
    zIndex: 30,
    elevation: 30,
    flexDirection: "row",
    gap: 9,
  },
  togglePillWrap: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 30,
    elevation: 30,
  },
});
