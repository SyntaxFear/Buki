import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/glass";
import type { Drawing } from "@/store/drawings";
import { colors } from "@/theme";
import { fitRect, type Rect } from "@/utils/book-layout";

interface Props {
  drawing: Drawing;
  /** The drawing's fitted rect on the page — where the zoom starts and ends */
  originRect: Rect;
  onClose: () => void;
}

/**
 * Fullscreen viewer: the tapped drawing zooms up from its page spot, can be
 * pinch-zoomed and panned, and — when the original photo was preserved —
 * flipped between the cutout and the real photograph.
 */
export function DrawingViewer({ drawing, originRect, onClose }: Props) {
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
    open.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [open]);

  useEffect(() => {
    photoFade.value = withTiming(mode === "photo" ? 1 : 0, { duration: 240 });
  }, [mode, photoFade]);

  const close = () => {
    scale.value = withTiming(1, { duration: 160 });
    tx.value = withTiming(0, { duration: 160 });
    ty.value = withTiming(0, { duration: 160 });
    open.value = withTiming(0, { duration: 280, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  const clampBack = () => {
    "worklet";
    if (scale.value < 1) {
      scale.value = withSpring(1, { damping: 18, stiffness: 220 });
      tx.value = withSpring(0, { damping: 18, stiffness: 220 });
      ty.value = withSpring(0, { damping: 18, stiffness: 220 });
    }
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(6, savedScale.value * e.scale);
    })
    .onEnd(clampBack);

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      clampBack();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = withSpring(1, { damping: 16, stiffness: 200 });
        tx.value = withSpring(0, { damping: 16, stiffness: 200 });
        ty.value = withSpring(0, { damping: 16, stiffness: 200 });
      } else {
        scale.value = withSpring(2.4, { damping: 16, stiffness: 200 });
      }
    });

  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: open.value }));

  const imageStyle = useAnimatedStyle(() => {
    const x = interpolate(open.value, [0, 1], [originRect.x, destRect.x]);
    const y = interpolate(open.value, [0, 1], [originRect.y, destRect.y]);
    const w = interpolate(open.value, [0, 1], [originRect.width, destRect.width]);
    const h = interpolate(open.value, [0, 1], [originRect.height, destRect.height]);
    const rot = interpolate(open.value, [0, 1], [drawing.rotation, 0]);
    return {
      position: "absolute" as const,
      left: x + tx.value,
      top: y + ty.value,
      width: w,
      height: h,
      transform: [{ rotate: `${rot}deg` }, { scale: scale.value }],
    };
  });

  const drawingOpacity = useAnimatedStyle(() => ({ opacity: 1 - photoFade.value }));
  const photoOpacity = useAnimatedStyle(() => ({ opacity: photoFade.value }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.7, 1], [0, 0, 1]),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <GestureDetector gesture={gestures}>
        <Animated.View style={imageStyle}>
          <Animated.View style={[StyleSheet.absoluteFill, drawingOpacity]}>
            <Image source={{ uri: drawing.uri }} style={styles.img} resizeMode="contain" />
          </Animated.View>
          {drawing.photoUri ? (
            <Animated.View style={[StyleSheet.absoluteFill, styles.photoCard, photoOpacity]}>
              <Image source={{ uri: drawing.photoUri }} style={styles.img} resizeMode="contain" />
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      <Animated.View style={[styles.topBar, { top: insets.top + 8 }, chromeStyle]}>
        <Pressable onPress={close}>
          <Glass tint="rgba(30,26,22,0.4)" fallbackColor="rgba(255,247,238,0.18)" interactive style={styles.closeBtn}>
            <SymbolView name="xmark" size={17} tintColor="#F5F2ED" />
          </Glass>
        </Pressable>
      </Animated.View>

      {drawing.photoUri ? (
        <Animated.View style={[styles.togglePillWrap, { bottom: insets.bottom + 30 }, chromeStyle]}>
          <Glass tint="rgba(30,26,22,0.35)" fallbackColor="rgba(255,247,238,0.14)" style={styles.togglePill}>
          {(
            [
              { key: "drawing", label: "Drawing" },
              { key: "photo", label: "Photo" },
            ] as const
          ).map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setMode(opt.key)}
              style={[styles.toggleOpt, mode === opt.key && styles.toggleOptActive]}
            >
              <Text style={[styles.toggleText, mode === opt.key && styles.toggleTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
          </Glass>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: "rgba(24,20,16,0.82)",
  },
  img: {
    width: "100%",
    height: "100%",
  },
  photoCard: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0E0C0A",
  },
  topBar: {
    position: "absolute",
    right: 16,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  togglePillWrap: {
    position: "absolute",
    alignSelf: "center",
  },
  togglePill: {
    flexDirection: "row",
    borderRadius: 22,
    padding: 4,
    gap: 4,
  },
  toggleOpt: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
  },
  toggleOptActive: {
    backgroundColor: colors.fab,
  },
  toggleText: {
    color: "rgba(245,242,237,0.75)",
    fontSize: 14.5,
    fontWeight: "600",
  },
  toggleTextActive: {
    color: "#FFF7EE",
    fontWeight: "700",
  },
});
