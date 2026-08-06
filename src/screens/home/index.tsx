import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Easing, runOnJS, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FlyingCutout } from "@/components/flying-cutout";
import { Scrapbook, type FlipState } from "@/components/scrapbook";
import { HandwrittenTitle } from "@/components/handwritten-title";
import { useDrawings } from "@/store/drawings";
import { colors } from "@/theme";
import { getBookLayout } from "@/utils/book-layout";

const FLIP_MS = 680;

export function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const layout = getBookLayout(W, H);

  const drawings = useDrawings((s) => s.drawings);
  const pending = useDrawings((s) => s.pending);
  const hydrated = useDrawings((s) => s.hydrated);
  const commitPending = useDrawings((s) => s.commitPending);
  const clearAll = useDrawings((s) => s.clearAll);

  const [spread, setSpread] = useState(0);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const flipAnim = useSharedValue(0);
  const flipBusy = useRef(false);
  const touredRef = useRef(false);
  const spreadRef = useRef(0);

  const jumpToSpread = useCallback((v: number) => {
    spreadRef.current = v;
    setSpread(v);
  }, []);

  const finishFlip = useCallback(
    (to: number) => {
      jumpToSpread(to);
      setFlip(null);
      flipAnim.value = 0;
      flipBusy.current = false;
    },
    [flipAnim, jumpToSpread],
  );

  const flipTo = useCallback(
    (to: number) => {
      if (flipBusy.current) return;
      flipBusy.current = true;
      setFlip({ from: spreadRef.current, to });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      flipAnim.value = 0;
      flipAnim.value = withTiming(1, { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(finishFlip)(to);
      });
    },
    [flipAnim, finishFlip],
  );

  // Launch tour: flip through the saved collection, ending on the empty spread
  useEffect(() => {
    if (!hydrated || touredRef.current) return;
    touredRef.current = true;
    if (drawings.length === 0) return;
    let cancelled = false;
    let next = 1;
    const step = () => {
      if (cancelled) return;
      if (next > drawings.length) return;
      flipTo(next);
      next += 1;
      timer = setTimeout(step, FLIP_MS + 240);
    };
    let timer = setTimeout(step, 1400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // A new scan is incoming: snap to the empty spread so it can land there
  useEffect(() => {
    if (pending && !flip) {
      jumpToSpread(drawings.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const handleLanded = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    commitPending();
    // The landed drawing owns the spread we're looking at
    jumpToSpread(Math.max(0, useDrawings.getState().drawings.length - 1));
  }, [commitPending, jumpToSpread]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onEnd((e) => {
      if (pending) return;
      if (e.translationX < -46 && spread < drawings.length) flipTo(spread + 1);
      else if (e.translationX > 46 && spread > 0) flipTo(spread - 1);
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <HandwrittenTitle width={W} />

      <Scrapbook layout={layout} drawings={drawings} spread={spread} flip={flip} flipAnim={flipAnim} />

      {/* gesture surface over the book */}
      <GestureDetector gesture={pan}>
        <View
          style={{
            position: "absolute",
            left: layout.book.x,
            top: layout.book.y,
            width: layout.book.width,
            height: layout.book.height,
          }}
        />
      </GestureDetector>

      {pending ? (
        <FlyingCutout pending={pending} targetSlot={layout.rightSlot} onLanded={handleLanded} />
      ) : null}

      <Pressable
        onPress={() => router.push("/scan")}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          clearAll();
          jumpToSpread(0);
        }}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 26, backgroundColor: pressed ? colors.fabPressed : colors.fab },
        ]}
      >
        <SymbolView name="camera.fill" size={26} tintColor="#FFF7EE" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fab: {
    position: "absolute",
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7A4A38",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
});
