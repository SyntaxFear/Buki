import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { cancelAnimation, Easing, runOnJS, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DrawingViewer } from "@/components/drawing-viewer";
import { FlyingCutout } from "@/components/flying-cutout";
import { HandwrittenTitle } from "@/components/handwritten-title";
import { PagePagination } from "@/components/page-pagination";
import { PadDrawer } from "@/components/pad-drawer";
import { FlipPad } from "@/components/flip-pad";
import { Scrapbook, type FlipState } from "@/components/scrapbook";
import { useAuth } from "@/store/auth";
import { activeDrawingsOf, activePadOf, useDrawings, type Drawing } from "@/store/drawings";
import { confirmAdult } from "@/store/parental-gate";
import { colors } from "@/theme";
import { Haptics, impactHaptic, notificationHaptic, selectionHaptic } from "@/utils/haptics";
import {
  drawingHitTest,
  getBookLayout,
  getPadPageLayout,
  slotIndexForIndex,
  unitCount,
  unitForIndex,
  type Rect,
} from "@/utils/book-layout";
import {
  PAGE_FLIP_AUTO_DURATION,
  logPageFlip,
  pageFlipProgress,
  pageFlipSettleDuration,
  shouldCompletePageFlip,
  type PageFlipDirection,
} from "@/utils/page-flip";

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
  const adultProfile = useAuth((s) => s.profile);

  const style = pad?.style ?? "spread";
  // Garden Path title canvas (82) + the 44pt sketchpad selector below it.
  const headerBottom = insets.top + 122;
  const fabReserve = insets.bottom + (H < 720 ? 128 : 108);
  const spreadLayout = useMemo(
    () => getBookLayout(W, H, headerBottom),
    [H, W, headerBottom],
  );
  const padLayout = useMemo(
    () => getPadPageLayout(style === "spread" ? "vertical" : style, W, H, headerBottom, fabReserve),
    [H, W, fabReserve, headerBottom, style],
  );
  const bookRect = style === "spread" ? spreadLayout.book : padLayout.book;
  const horizontalFlip = style === "spread" || style === "album";
  const pageExtent =
    style === "spread"
      ? spreadLayout.rightPage.width
      : horizontalFlip
        ? padLayout.page.width
        : padLayout.page.height;
  const crossAxisOffset = horizontalFlip
    ? (style === "spread" ? spreadLayout.rightPage.y : padLayout.page.y) - bookRect.y
    : padLayout.page.x - bookRect.x;
  const crossAxisExtent = horizontalFlip
    ? style === "spread"
      ? spreadLayout.rightPage.height
      : padLayout.page.height
    : padLayout.page.width;

  const [unit, setUnit] = useState(0);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [flipHandoffTarget, setFlipHandoffTarget] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState<{ drawing: Drawing; rect: Rect } | null>(null);
  const flipAnim = useSharedValue(0);
  const flipCurl = useSharedValue(0.82);
  const flipLocked = useSharedValue(0);
  const flipMounted = useSharedValue(0);
  const gestureDirection = useSharedValue(0);
  const gestureProgress = useSharedValue(0);
  const gestureTarget = useSharedValue(0);
  const gestureSettling = useSharedValue(0);
  const gestureCrest = useSharedValue(0);
  const flipBusy = useRef(false);
  const autoFlipTarget = useRef<number | null>(null);
  const touredRef = useRef(false);
  const activePadIdRef = useRef<string | null>(null);
  const unitRef = useRef(0);

  const maxUnit = unitCount(drawings.length, style) - 1;

  const jumpToUnit = useCallback((v: number) => {
    unitRef.current = v;
    setUnit(v);
  }, []);

  const finishFlip = useCallback(
    (to: number) => {
      logPageFlip("commit-request", {
        from: unitRef.current,
        to,
        progress: flipAnim.value,
      });
      jumpToUnit(to);
      setFlipHandoffTarget(to);
    },
    [flipAnim, jumpToUnit],
  );

  // Keep the completed shader frame mounted until React has committed the
  // target page underneath it. Removing both in one update intermittently
  // exposed a blank/stale Skia frame on slower commits.
  useEffect(() => {
    if (flipHandoffTarget === null || unit !== flipHandoffTarget || !flip) return;
    logPageFlip("handoff-committed", {
      from: flip.from,
      to: flip.to,
      progress: flipAnim.value,
    });
    const releaseTimer = setTimeout(() => {
      logPageFlip("renderer-release", {
        to: flipHandoffTarget,
        progress: flipAnim.value,
      });
      setFlip(null);
      setFlipHandoffTarget(null);
    }, 34);
    return () => clearTimeout(releaseTimer);
  }, [flip, flipAnim, flipHandoffTarget, unit]);

  const flipTo = useCallback(
    (to: number) => {
      if (flipBusy.current) return;
      const from = unitRef.current;
      if (to === from || to < 0 || to > maxUnit || Math.abs(to - from) !== 1) {
        logPageFlip("auto-skip-invalid-target", { from, to, maxUnit });
        return;
      }
      flipBusy.current = true;
      flipLocked.value = 1;
      flipMounted.value = 0;
      flipCurl.value = 0.82;
      gestureProgress.value = 0;
      autoFlipTarget.current = to;
      logPageFlip("auto-request", { from, to });
      setFlip({ from, to });
      impactHaptic(Haptics.ImpactFeedbackStyle.Light);
      cancelAnimation(flipAnim);
      flipAnim.value = 0;
    },
    [flipAnim, flipCurl, flipLocked, flipMounted, gestureProgress, maxUnit],
  );

  // Every turn is armed only after React has committed the two page snapshots.
  // Interactive progress is buffered on the UI thread until this handshake.
  useEffect(() => {
    if (!flip) return;
    const isAuto = autoFlipTarget.current === flip.to;
    const to = flip.to;
    if (isAuto) autoFlipTarget.current = null;
    const frame = requestAnimationFrame(() => {
      if (isAuto) {
        flipMounted.value = 1;
        logPageFlip("auto-animation-start", {
          from: flip.from,
          to,
          progress: flipAnim.value,
        });
        flipAnim.value = withTiming(
          1,
          {
            duration: PAGE_FLIP_AUTO_DURATION,
            easing: Easing.bezier(0.22, 0.61, 0.36, 1),
          },
          (finished) => {
            if (finished) runOnJS(finishFlip)(to);
          },
        );
      } else {
        const bufferedProgress = gestureProgress.value;
        const alreadySettling = gestureSettling.value > 0;
        if (!alreadySettling) {
          flipAnim.value = bufferedProgress;
          flipMounted.value = 1;
        }
        logPageFlip("gesture-renderer-armed", {
          from: flip.from,
          to,
          bufferedProgress,
          alreadySettling,
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [finishFlip, flip, flipAnim, flipMounted, gestureProgress, gestureSettling]);

  // This is deliberately post-commit. Resetting progress in finishFlip makes
  // the still-mounted shader draw its starting face for one frame (the blink).
  useEffect(() => {
    logPageFlip("react-commit", {
      unit,
      from: flip?.from,
      to: flip?.to,
      mounted: Boolean(flip),
      progress: flipAnim.value,
    });
    if (flip) return;

    const previousProgress = flipAnim.value;
    cancelAnimation(flipAnim);
    flipAnim.value = 0;
    flipLocked.value = 0;
    flipMounted.value = 0;
    gestureDirection.value = 0;
    gestureProgress.value = 0;
    gestureSettling.value = 0;
    gestureCrest.value = 0;
    flipBusy.current = false;
    logPageFlip("renderer-unmounted-reset", { unit, previousProgress, resetTo: 0 });
  }, [
    flip,
    flipAnim,
    flipLocked,
    flipMounted,
    gestureCrest,
    gestureDirection,
    gestureProgress,
    gestureSettling,
    unit,
  ]);

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
      timer = setTimeout(step, PAGE_FLIP_AUTO_DURATION + 240);
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
    autoFlipTarget.current = null;
    setFlipHandoffTarget(null);
    cancelAnimation(flipAnim);
    setFlip(null);
    const isInitialPad = activePadIdRef.current === null;
    activePadIdRef.current = pad.id;
    jumpToUnit(
      isInitialPad
        ? 0
        : unitCount(activeDrawingsOf(useDrawings.getState()).length, pad.style) - 1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad?.id]);

  // A new scan is incoming: snap to the unit where it will land
  useEffect(() => {
    if (pending && !flip) {
      jumpToUnit(unitForIndex(drawings.length, style));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(() => () => cancelAnimation(flipAnim), [flipAnim]);

  const handleLanded = useCallback(() => {
    impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    commitPending();
    const s = useDrawings.getState();
    const list = activeDrawingsOf(s);
    const st = activePadOf(s)?.style ?? "spread";
    jumpToUnit(unitForIndex(Math.max(0, list.length - 1), st));
  }, [commitPending, jumpToUnit]);

  const nextIndex = drawings.length;
  const flySlot =
    style === "spread"
      ? slotIndexForIndex(nextIndex, "spread") === 1
        ? spreadLayout.rightSlot
        : spreadLayout.leftSlot
      : padLayout.slots[slotIndexForIndex(nextIndex, style)];

  const settleFlip = useCallback(
    (to: number, completed: boolean) => {
      if (completed) {
        logPageFlip("settle-finished", { to, completed, progress: flipAnim.value });
        impactHaptic(Haptics.ImpactFeedbackStyle.Soft);
        finishFlip(to);
      } else {
        logPageFlip("settle-finished", { to, completed, progress: flipAnim.value });
        setFlipHandoffTarget(unitRef.current);
      }
    },
    [finishFlip, flipAnim],
  );

  const beginInteractiveFlip = useCallback((to: number) => {
    if (flipBusy.current) return;
    flipBusy.current = true;
    autoFlipTarget.current = null;
    logPageFlip("gesture-start", { from: unitRef.current, to });
    setFlip({ from: unitRef.current, to });
    impactHaptic(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const playCrestHaptic = useCallback(() => {
    selectionHaptic();
  }, []);
  const pageFlipBlocked = Boolean(pending) || drawerOpen;

  // Interactive updates stay on the UI thread. JS only mounts/unmounts the
  // page snapshots and fires sparse haptics at grab, crest, and landing.
  const pan = Gesture.Pan()
    .minDistance(6)
    .onUpdate((e) => {
      const delta = horizontalFlip ? e.translationX : e.translationY;
      if (gestureDirection.value === 0) {
        if (flipLocked.value > 0 || pageFlipBlocked || Math.abs(delta) < 6) return;
        const dir: PageFlipDirection = delta < 0 ? 1 : -1;
        const to = unit + dir;
        if (to < 0 || to > maxUnit) return;

        const crossPosition = horizontalFlip ? e.y : e.x;
        flipCurl.value = Math.min(
          0.92,
          Math.max(0.08, (crossPosition - crossAxisOffset) / Math.max(1, crossAxisExtent)),
        );
        flipLocked.value = 1;
        flipMounted.value = 0;
        gestureDirection.value = dir;
        gestureProgress.value = 0;
        gestureTarget.value = to;
        gestureSettling.value = 0;
        gestureCrest.value = 0;
        flipAnim.value = 0;
        runOnJS(beginInteractiveFlip)(to);
      }
      if (gestureSettling.value > 0) return;

      const crossPosition = horizontalFlip ? e.y : e.x;
      flipCurl.value = Math.min(
        0.92,
        Math.max(0.08, (crossPosition - crossAxisOffset) / Math.max(1, crossAxisExtent)),
      );
      const progress = pageFlipProgress(
        delta,
        pageExtent,
        gestureDirection.value as PageFlipDirection,
      );
      gestureProgress.value = progress;
      if (flipMounted.value > 0) flipAnim.value = progress;

      if (gestureCrest.value === 0 && progress >= 0.5) {
        gestureCrest.value = 1;
        runOnJS(playCrestHaptic)();
      } else if (gestureCrest.value === 1 && progress < 0.44) {
        gestureCrest.value = 0;
      }
    })
    .onEnd((e) => {
      const directionValue = gestureDirection.value;
      if (directionValue === 0 || gestureSettling.value > 0) return;
      const direction = directionValue as PageFlipDirection;
      gestureSettling.value = 1;
      const progress = gestureProgress.value;
      const velocity = horizontalFlip ? e.velocityX : e.velocityY;
      const complete = shouldCompletePageFlip(progress, velocity, direction);
      const target = gestureTarget.value;
      runOnJS(logPageFlip)("settle-request", {
        to: target,
        progress,
        velocity: Math.round(velocity),
        completed: complete,
      });
      flipMounted.value = 1;
      flipAnim.value = withTiming(
        complete ? 1 : 0,
        {
          duration: pageFlipSettleDuration(progress, complete),
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished) runOnJS(settleFlip)(target, complete);
        },
      );
    })
    .onFinalize(() => {
      const directionValue = gestureDirection.value;
      if (directionValue === 0 || gestureSettling.value > 0) return;
      const direction = directionValue as PageFlipDirection;
      gestureSettling.value = 1;
      const progress = gestureProgress.value;
      const complete = shouldCompletePageFlip(progress, 0, direction);
      const target = gestureTarget.value;
      runOnJS(logPageFlip)("settle-finalize", {
        to: target,
        progress,
        completed: complete,
      });
      flipMounted.value = 1;
      flipAnim.value = withTiming(
        complete ? 1 : 0,
        {
          duration: pageFlipSettleDuration(progress, complete),
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished) runOnJS(settleFlip)(target, complete);
        },
      );
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
        padLayout,
      );
      if (hit && drawings[hit.index]) {
        impactHaptic(Haptics.ImpactFeedbackStyle.Light);
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

      <Pressable
        onPress={() => router.push("/account")}
        accessibilityRole="button"
        accessibilityLabel="Open profile and account"
        hitSlop={8}
        style={({ pressed }) => [
          styles.accountButton,
          { top: insets.top + 12 },
          pressed && styles.accountButtonPressed,
        ]}
      >
        <Text style={styles.accountAvatar}>
          {adultProfile?.avatarUri?.startsWith("emoji:")
            ? adultProfile.avatarUri.slice("emoji:".length)
            : (adultProfile?.displayName.trim().charAt(0).toUpperCase() || "P")}
        </Text>
      </Pressable>

      <View style={styles.padPillWrap}>
        <Pressable
          onPress={() => setDrawerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Choose sketchpad. Current sketchpad: ${pad?.name ?? "My Book"}`}
          accessibilityHint="Opens your sketchpad collection"
          hitSlop={4}
          style={({ pressed }) => [styles.padPill, pressed && styles.padPillPressed]}
        >
          <View style={[styles.padPillIcon, { backgroundColor: pad?.coverColor ?? colors.bookBorder }]}>
            <SymbolView name="books.vertical.fill" size={15} tintColor={colors.page} />
          </View>
          <Text style={styles.padPillText} numberOfLines={1}>
            {pad?.name ?? ""}
          </Text>
          <SymbolView name="chevron.down" size={12} tintColor={colors.titleTeal} />
        </Pressable>
      </View>

      {style === "spread" ? (
        <Scrapbook
          layout={spreadLayout}
          drawings={drawings}
          spread={unit}
          flip={flip}
          flipAnim={flipAnim}
          flipCurl={flipCurl}
          coverColor={pad?.coverColor}
          pageColor={pad?.pageColor}
          design={pad?.design}
        />
      ) : (
        <FlipPad
          style={style}
          layout={padLayout}
          drawings={drawings}
          page={unit}
          flip={flip}
          flipAnim={flipAnim}
          flipCurl={flipCurl}
          coverColor={pad?.coverColor}
          pageColor={pad?.pageColor}
          design={pad?.design}
        />
      )}

      <PagePagination
        currentUnit={unit}
        drawingCount={drawings.length}
        style={style}
        top={bookRect.y + bookRect.height + 10}
        coverColor={pad?.coverColor}
        design={pad?.design}
      />

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
        <View style={{ position: "absolute", left: 0, top: headerBottom, bottom: 0, width: 24 }} />
      </GestureDetector>

      {pending ? <FlyingCutout pending={pending} targetSlot={flySlot} onLanded={handleLanded} /> : null}

      <View style={[styles.fabWrap, { bottom: insets.bottom + 26 }]}>
        <View style={styles.fabShell}>
          <Pressable
            onPress={() => router.push("/scan")}
            onLongPress={() => {
              notificationHaptic(Haptics.NotificationFeedbackType.Warning);
              void (async () => {
                const confirmed = await confirmAdult(
                  "Clearing a sketchpad permanently removes its saved drawings from this device.",
                );
                if (!confirmed) return;
                Alert.alert(
                  `Clear “${pad?.name ?? "this sketchpad"}”?`,
                  "This removes every saved drawing from this sketchpad.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () => {
                        clearActivePad();
                        jumpToUnit(0);
                      },
                    },
                  ],
                );
              })();
            }}
            accessibilityRole="button"
            accessibilityLabel="Scan a drawing"
            accessibilityHint="Opens the camera. Long-press to clear this sketchpad."
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <SymbolView name="camera.fill" size={27} tintColor={colors.page} />
          </Pressable>
        </View>
      </View>

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
  accountButton: {
    position: "absolute",
    right: 18,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: "rgba(22,125,130,0.22)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#75624B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
  },
  accountButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  accountAvatar: { fontSize: 21, fontWeight: "900", color: colors.titleTeal },
  padPillWrap: {
    alignSelf: "flex-start",
    marginLeft: 20,
    marginTop: -8,
    maxWidth: 236,
  },
  padPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#75624B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  padPillPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
  padPillIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  padPillText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  fabWrap: {
    position: "absolute",
    alignSelf: "center",
    shadowColor: "#7A543B",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  fabShell: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,118,94,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.fab,
    alignItems: "center",
    justifyContent: "center",
  },
  fabPressed: {
    backgroundColor: colors.fabPressed,
    transform: [{ scale: 0.96 }],
  },
});
