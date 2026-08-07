import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Easing, runOnJS, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DrawingViewer } from "@/components/drawing-viewer";
import { FlyingCutout } from "@/components/flying-cutout";
import { HandwrittenTitle } from "@/components/handwritten-title";
import { PadDrawer } from "@/components/pad-drawer";
import { Scrapbook, type FlipState } from "@/components/scrapbook";
import { VerticalBook } from "@/components/vertical-book";
import { activeDrawingsOf, activePadOf, useDrawings, type Drawing } from "@/store/drawings";
import { colors } from "@/theme";
import {
  drawingHitTest,
  getBookLayout,
  getVerticalLayout,
  sideForIndex,
  unitCount,
  unitForIndex,
  type Rect,
} from "@/utils/book-layout";

const FLIP_MS = 680;

export function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const pad = useDrawings(activePadOf);
  const drawings = useDrawings(activeDrawingsOf);
  const pending = useDrawings((s) => s.pending);
  const hydrated = useDrawings((s) => s.hydrated);
  const commitPending = useDrawings((s) => s.commitPending);
  const clearActivePad = useDrawings((s) => s.clearActivePad);

  const style = pad?.style ?? "spread";
  const spreadLayout = getBookLayout(W, H);
  const verticalLayout = getVerticalLayout(W, H);
  const bookRect = style === "spread" ? spreadLayout.book : verticalLayout.book;

  const [unit, setUnit] = useState(0);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState<{ drawing: Drawing; rect: Rect } | null>(null);
  const flipAnim = useSharedValue(0);
  const flipBusy = useRef(false);
  const touredRef = useRef(false);
  const unitRef = useRef(0);

  const maxUnit = unitCount(drawings.length, style) - 1;

  const jumpToUnit = useCallback((v: number) => {
    unitRef.current = v;
    setUnit(v);
  }, []);

  const finishFlip = useCallback(
    (to: number) => {
      jumpToUnit(to);
      setFlip(null);
      flipAnim.value = 0;
      flipBusy.current = false;
    },
    [flipAnim, jumpToUnit],
  );

  const flipTo = useCallback(
    (to: number) => {
      if (flipBusy.current) return;
      flipBusy.current = true;
      setFlip({ from: unitRef.current, to });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      flipAnim.value = 0;
      flipAnim.value = withTiming(1, { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(finishFlip)(to);
      });
    },
    [flipAnim, finishFlip],
  );

  // Launch tour: flip through the saved collection, ending on the empty unit
  useEffect(() => {
    if (!hydrated || touredRef.current) return;
    touredRef.current = true;
    const tourStops = unitCount(drawings.length, style) - 1;
    if (tourStops <= 0) return;
    let cancelled = false;
    let next = 1;
    const step = () => {
      if (cancelled) return;
      if (next > tourStops) return;
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

  // Switching sketchpads: land on the newest (partially filled or empty) unit
  useEffect(() => {
    if (!pad) return;
    setFlip(null);
    flipAnim.value = 0;
    flipBusy.current = false;
    jumpToUnit(unitCount(activeDrawingsOf(useDrawings.getState()).length, pad.style) - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad?.id]);

  // A new scan is incoming: snap to the unit where it will land
  useEffect(() => {
    if (pending && !flip) {
      jumpToUnit(unitForIndex(drawings.length, style));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const handleLanded = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    commitPending();
    const s = useDrawings.getState();
    const list = activeDrawingsOf(s);
    const st = activePadOf(s)?.style ?? "spread";
    jumpToUnit(unitForIndex(Math.max(0, list.length - 1), st));
  }, [commitPending, jumpToUnit]);

  const nextIndex = drawings.length;
  const flySlot =
    style === "spread"
      ? sideForIndex(nextIndex, "spread") === 1
        ? spreadLayout.rightSlot
        : spreadLayout.leftSlot
      : verticalLayout.slot;

  // ---- Interactive page drag: the finger drives the curl like real paper ----
  const dragState = useRef({ active: false, settling: false, dir: 1 as 1 | -1, to: 0, crest: false });
  const maxUnitRef = useRef(maxUnit);
  maxUnitRef.current = maxUnit;

  const settleFlip = useCallback(
    (to: number, completed: boolean) => {
      const d = dragState.current;
      d.active = false;
      d.settling = false;
      d.crest = false;
      if (completed) {
        // the page lands
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
        finishFlip(to);
      } else {
        setFlip(null);
        flipAnim.value = 0;
        flipBusy.current = false;
      }
    },
    [finishFlip, flipAnim],
  );

  const releaseDrag = useCallback(
    (velocity: number) => {
      const d = dragState.current;
      if (!d.active || d.settling) return;
      d.settling = true;
      const fling = d.dir > 0 ? velocity < -420 : velocity > 420;
      const p = flipAnim.value;
      const complete = fling || p > 0.34;
      const remaining = complete ? 1 - p : p;
      const to = d.to;
      flipAnim.value = withTiming(
        complete ? 1 : 0,
        { duration: 90 + 240 * remaining, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(settleFlip)(to, complete);
        },
      );
    },
    [flipAnim, settleFlip],
  );

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(6)
    .onUpdate((e) => {
      const d = dragState.current;
      const delta = style === "spread" ? e.translationX : e.translationY;
      if (!d.active) {
        if (flipBusy.current || pending || drawerOpen || Math.abs(delta) < 6) return;
        const dir: 1 | -1 = delta < 0 ? 1 : -1;
        const to = unitRef.current + dir;
        if (to < 0 || to > maxUnitRef.current) return;
        flipBusy.current = true;
        d.active = true;
        d.settling = false;
        d.dir = dir;
        d.to = to;
        d.crest = false;
        setFlip({ from: unitRef.current, to });
        // fingertip grabs the page
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return;
      }
      if (d.settling) return;
      const span = (style === "spread" ? bookRect.width : bookRect.height) * 0.9;
      const raw = (d.dir > 0 ? -delta : delta) / span;
      flipAnim.value = Math.min(1, Math.max(0, raw));
      // the paper crests over the spine
      if (!d.crest && flipAnim.value > 0.5) {
        d.crest = true;
        Haptics.selectionAsync().catch(() => {});
      } else if (d.crest && flipAnim.value < 0.42) {
        d.crest = false;
        Haptics.selectionAsync().catch(() => {});
      }
    })
    .onEnd((e) => {
      releaseDrag(style === "spread" ? e.velocityX : e.velocityY);
    })
    .onFinalize(() => {
      // safety: if the gesture was cancelled before onEnd, settle from here
      releaseDrag(0);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success || pending || flip || drawerOpen) return;
      const hit = drawingHitTest(
        e.absoluteX,
        e.absoluteY,
        style,
        unitRef.current,
        drawings,
        spreadLayout,
        verticalLayout,
      );
      if (hit && drawings[hit.index]) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setViewing({ drawing: drawings[hit.index], rect: hit.rect });
      }
    });

  const bookGesture = Gesture.Exclusive(pan, tap);

  const edgeOpen = Gesture.Pan()
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX > 40) setDrawerOpen(true);
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <HandwrittenTitle width={W} />

      {/* active sketchpad pill */}
      <Pressable
        onPress={() => setDrawerOpen(true)}
        style={({ pressed }) => [styles.padPill, pressed && { opacity: 0.7 }]}
      >
        <SymbolView name="books.vertical.fill" size={14} tintColor={pad?.coverColor ?? colors.bookBorder} />
        <Text style={styles.padPillText} numberOfLines={1}>
          {pad?.name ?? ""}
        </Text>
        <SymbolView name="chevron.down" size={10} tintColor="#8D8271" />
      </Pressable>

      {style === "spread" ? (
        <Scrapbook
          layout={spreadLayout}
          drawings={drawings}
          spread={unit}
          flip={flip}
          flipAnim={flipAnim}
          coverColor={pad?.coverColor}
        />
      ) : (
        <VerticalBook
          layout={verticalLayout}
          drawings={drawings}
          page={unit}
          flip={flip}
          flipAnim={flipAnim}
          coverColor={pad?.coverColor}
        />
      )}

      {/* gesture surface over the book */}
      <GestureDetector gesture={bookGesture}>
        <View
          style={{
            position: "absolute",
            left: bookRect.x,
            top: bookRect.y,
            width: bookRect.width,
            height: bookRect.height,
          }}
        />
      </GestureDetector>

      {/* left-edge swipe opens the drawer */}
      <GestureDetector gesture={edgeOpen}>
        <View style={{ position: "absolute", left: 0, top: insets.top + 90, bottom: 0, width: 24 }} />
      </GestureDetector>

      {pending ? <FlyingCutout pending={pending} targetSlot={flySlot} onLanded={handleLanded} /> : null}

      <Pressable
        onPress={() => router.push("/scan")}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          clearActivePad();
          jumpToUnit(0);
        }}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 26, backgroundColor: pressed ? colors.fabPressed : colors.fab },
        ]}
      >
        <SymbolView name="camera.fill" size={26} tintColor="#FFF7EE" />
      </Pressable>

      <PadDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {viewing ? (
        <DrawingViewer
          drawing={viewing.drawing}
          originRect={viewing.rect}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginLeft: 22,
    marginTop: -6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,253,246,0.85)",
    maxWidth: 220,
  },
  padPillText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#5A4F41",
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
