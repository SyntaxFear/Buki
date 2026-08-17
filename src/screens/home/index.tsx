import { useNavigation, useRouter } from "expo-router";
import { DrawerActions } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runOnUIAsync } from "react-native-worklets";

import { DrawingViewer } from "@/components/drawing-viewer";
import { FlyingCutout } from "@/components/flying-cutout";
import { FlipPad } from "@/components/flip-pad";
import { HandwrittenTitle } from "@/components/handwritten-title";
import { NativeCaptureButton } from "@/components/native-capture-button";
import { NativeToolbarButton } from "@/components/native-toolbar-button";
import { PagePagination } from "@/components/page-pagination";
import { Scrapbook, type FlipState } from "@/components/scrapbook";
import {
  activeDrawingsOf,
  activePadOf,
  DEFAULT_PAD_STYLE,
  useDrawings,
  type Drawing,
  type PadStyle,
} from "@/store/drawings";
import { confirmAdult } from "@/store/parental-gate";
import { getPadIcon } from "@/pad-icons";
import { colors } from "@/theme";
import {
  Haptics,
  impactHaptic,
  pageTurnBoundaryHaptic,
  pageTurnCrestHaptic,
  startPageTurnHaptic,
  stopPageTurnHaptic,
  updatePageTurnHaptic,
  usePageTurnHaptics,
} from "@/utils/haptics";
import {
  drawingHitTest,
  getBookLayout,
  getPadPageLayout,
  slotIndexForIndex,
  unitCapacity,
  unitCount,
  unitForIndex,
  type Rect,
} from "@/utils/book-layout";
import { requestArtworkDeletion } from "@/utils/artwork-deletion";
import {
  PAGE_FLIP_AUTO_DURATION,
  logPageFlip,
  pageFlipImageId,
  pageFlipProgress,
  pageFlipShaderProgress,
  pageFlipSharedStateForPhase,
  pageFlipSettleDuration,
  resolvePageFlipIntent,
  shouldCompletePageFlip,
  type PageFlipDirection,
} from "@/utils/page-flip";
import { preloadCachedImage } from "@/utils/image-cache";
import { finalSketchpadUnit } from "@/utils/page-session";
import { getHomeBottomControls } from "@/utils/home-bottom-controls";

type FlipLifecyclePhase = "idle" | "preparing" | "active" | "retiring";

function drawingTraceLabel(drawing: Drawing | undefined): string {
  return drawing ? `${drawing.id}:${pageFlipImageId(drawing.uri)}` : "empty";
}

function unitTraceLabel(
  drawings: readonly Drawing[],
  style: PadStyle,
  unit: number,
): string {
  const capacity = unitCapacity(style);
  const labels: string[] = [];
  for (let slot = 0; slot < capacity; slot += 1) {
    labels.push(drawingTraceLabel(drawings[unit * capacity + slot]));
  }
  return labels.join("|");
}

function pageTurnHapticTexture(progress: number, velocity = 0): {
  intensity: number;
  sharpness: number;
} {
  "worklet";
  const clamped = Math.min(1, Math.max(0, progress));
  const fold = 1 - Math.abs(clamped * 2 - 1);
  const speed = Math.min(1, Math.abs(velocity) / 1800);
  return {
    intensity: 0.18 + fold * 0.42 + speed * 0.2,
    sharpness: 0.24 + fold * 0.24 + speed * 0.28,
  };
}

export function Home() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  usePageTurnHaptics();

  const pad = useDrawings(activePadOf);
  const drawings = useDrawings(activeDrawingsOf);
  const pending = useDrawings((s) => s.pending);
  const hydrated = useDrawings((s) => s.hydrated);
  const commitPending = useDrawings((s) => s.commitPending);
  const requestArtworkCreation = useDrawings((s) => s.requestArtworkCreation);
  const clearActivePad = useDrawings((s) => s.clearActivePad);
  const deleteDrawing = useDrawings((s) => s.deleteDrawing);

  const style = pad?.style ?? DEFAULT_PAD_STYLE;
  // Garden Path title canvas (82) + the 44pt sketchpad selector below it.
  const headerBottom = insets.top + 122;
  const bottomControls = useMemo(
    () => getHomeBottomControls(H, insets.bottom),
    [H, insets.bottom],
  );
  const spreadLayout = useMemo(
    () => getBookLayout(W, H, headerBottom),
    [H, W, headerBottom],
  );
  const padLayout = useMemo(
    () =>
      getPadPageLayout(
        style === "spread" ? "vertical" : style,
        W,
        H,
        headerBottom,
        bottomControls.bookBottomReserve,
      ),
    [H, W, bottomControls.bookBottomReserve, headerBottom, style],
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
    ? (style === "spread" ? spreadLayout.rightPage.y : padLayout.page.y) -
      bookRect.y
    : padLayout.page.x - bookRect.x;
  const crossAxisExtent = horizontalFlip
    ? style === "spread"
      ? spreadLayout.rightPage.height
      : padLayout.page.height
    : padLayout.page.width;

  const initialUnit = finalSketchpadUnit(drawings.length, style);
  const [unit, setUnit] = useState(initialUnit);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [flipHandoffTarget, setFlipHandoffTarget] = useState<number | null>(
    null,
  );
  const [viewing, setViewing] = useState<{
    drawing: Drawing;
    rect: Rect;
  } | null>(null);
  const flipAnim = useSharedValue(0);
  const flipCurl = useSharedValue(0.82);
  const flipLocked = useSharedValue(0);
  const flipMounted = useSharedValue(0);
  const gestureDirection = useSharedValue(0);
  const gestureProgress = useSharedValue(0);
  const gestureTarget = useSharedValue(0);
  const gestureSettling = useSharedValue(0);
  const gestureSettleGeneration = useSharedValue(0);
  const gestureCrest = useSharedValue(0);
  const gestureBoundaryBlocked = useSharedValue(0);
  const traceReactMounted = useSharedValue(0);
  const traceTurnId = useSharedValue(0);
  const flipBusy = useRef(false);
  const flipLifecycle = useRef<FlipLifecyclePhase>("idle");
  const flipPreparationRequest = useRef(0);
  const flipRetirementRequest = useRef(0);
  const autoFlipTarget = useRef<number | null>(null);
  const flipSequence = useRef(0);
  const flipRef = useRef<FlipState | null>(null);
  const paginationRequest = useRef(0);
  const stateCommitCount = useRef(0);
  const activePadStateRef = useRef<{
    id: string;
    style: typeof style;
  } | null>(null);
  const unitRef = useRef(initialUnit);
  const flipHandoffTargetRef = useRef<number | null>(null);

  const maxUnit = unitCount(drawings.length, style) - 1;
  const visibleUnit = flip?.to ?? unit;
  const settledUnitTrace = unitTraceLabel(drawings, style, unit);
  const visibleUnitTrace = unitTraceLabel(drawings, style, visibleUnit);
  const lastUnitTrace = unitTraceLabel(drawings, style, maxUnit);

  // Development diagnostics deliberately observe the UI-thread values that
  // drive Skia. JS lifecycle logs alone cannot expose a one-frame direction or
  // progress mismatch, which is exactly how the reverse-page flash presents.
  useAnimatedReaction(
    () => ({
      progress: flipAnim.value,
      locked: flipLocked.value,
      mounted: flipMounted.value,
      direction: gestureDirection.value,
      gestureProgress: gestureProgress.value,
      target: gestureTarget.value,
      settling: gestureSettling.value,
      generation: gestureSettleGeneration.value,
      crest: gestureCrest.value,
      boundaryBlocked: gestureBoundaryBlocked.value,
      reactMounted: traceReactMounted.value,
      turnId: traceTurnId.value,
    }),
    (next, previous) => {
      if (!__DEV__) return;
      const discreteChanged =
        !previous ||
        next.locked !== previous.locked ||
        next.mounted !== previous.mounted ||
        next.direction !== previous.direction ||
        next.target !== previous.target ||
        next.settling !== previous.settling ||
        next.generation !== previous.generation ||
        next.crest !== previous.crest ||
        next.boundaryBlocked !== previous.boundaryBlocked ||
        next.reactMounted !== previous.reactMounted ||
        next.turnId !== previous.turnId;
      if (!discreteChanged) return;

      runOnJS(logPageFlip)("ui-shared-state", {
        turnId: next.turnId || undefined,
        progress: Number(next.progress.toFixed(4)),
        shaderProgress: Number(
          pageFlipShaderProgress(next.progress, next.direction).toFixed(4),
        ),
        locked: next.locked,
        mounted: next.mounted,
        reactMounted: next.reactMounted,
        direction: next.direction,
        gestureProgress: Number(next.gestureProgress.toFixed(4)),
        target: next.target,
        settling: next.settling,
        generation: next.generation,
        crest: next.crest,
        boundaryBlocked: next.boundaryBlocked,
      });

      if (
        previous &&
        previous.direction < 0 &&
        next.direction === 0 &&
        next.progress >= 0.999 &&
        next.reactMounted > 0
      ) {
        runOnJS(logPageFlip)("ui-reverse-terminal-direction-reset", {
          turnId: next.turnId || undefined,
          progress: Number(next.progress.toFixed(4)),
          previousDirection: previous.direction,
          nextDirection: next.direction,
          previousShaderProgress: Number(
            pageFlipShaderProgress(
              previous.progress,
              previous.direction,
            ).toFixed(4),
          ),
          nextShaderProgress: Number(
            pageFlipShaderProgress(next.progress, next.direction).toFixed(4),
          ),
          reactMounted: next.reactMounted,
        });
      }
    },
  );

  const writeFlipState = useCallback(
    (next: FlipState | null, reason: string) => {
      const previous = flipRef.current;
      logPageFlip("state-flip-write", {
        reason,
        previousTurnId: previous?.id,
        previousSource: previous?.source,
        previousFrom: previous?.from,
        previousTo: previous?.to,
        nextTurnId: next?.id,
        nextSource: next?.source,
        nextFrom: next?.from,
        nextTo: next?.to,
        unit: unitRef.current,
        progress: flipAnim.value,
      });
      flipRef.current = next;
      setFlip(next);
    },
    [flipAnim],
  );

  const writeFlipHandoffTarget = useCallback(
    (next: number | null, reason: string) => {
      const previous = flipHandoffTargetRef.current;
      logPageFlip("state-handoff-write", {
        reason,
        turnId: flipRef.current?.id,
        source: flipRef.current?.source,
        from: previous,
        to: next,
        unit: unitRef.current,
        progress: flipAnim.value,
      });
      flipHandoffTargetRef.current = next;
      setFlipHandoffTarget(next);
    },
    [flipAnim],
  );

  const openDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);

  const jumpToUnit = useCallback((v: number, reason = "direct") => {
    const from = unitRef.current;
    const drawingState = useDrawings.getState();
    const currentPad = activePadOf(drawingState);
    if (currentPad) drawingState.rememberViewedUnit(currentPad.id, v);
    if (from === v) {
      logPageFlip("state-unit-skip", { from, to: v, reason });
      return;
    }
    logPageFlip("state-unit-write", {
      turnId: flipRef.current?.id,
      source: flipRef.current?.source,
      from,
      to: v,
      reason,
    });
    unitRef.current = v;
    setUnit(v);
  }, []);

  const finishFlip = useCallback(
    (to: number) => {
      const activeFlip = flipRef.current;
      logPageFlip("commit-request", {
        turnId: activeFlip?.id,
        source: activeFlip?.source,
        from: unitRef.current,
        to,
        progress: flipAnim.value,
      });
      jumpToUnit(to, "flip-finish");
      writeFlipHandoffTarget(to, "flip-finish");
    },
    [flipAnim, jumpToUnit, writeFlipHandoffTarget],
  );

  const retireFlipRenderer = useCallback(
    (activeFlip: FlipState, target: number) => {
      const request = ++flipRetirementRequest.current;
      flipLifecycle.current = "retiring";
      logPageFlip("renderer-retire-request", {
        request,
        turnId: activeFlip.id,
        source: activeFlip.source,
        to: target,
        progress: flipAnim.value,
      });

      void runOnUIAsync(() => {
        "worklet";
        cancelAnimation(flipAnim);
        const next = pageFlipSharedStateForPhase(
          flipAnim.value,
          "retire",
          gestureDirection.value,
        );
        flipAnim.value = next.progress;
        flipLocked.value = next.locked;
        flipMounted.value = next.mounted;
        gestureDirection.value = next.direction;
        gestureProgress.value = next.gestureProgress;
        gestureTarget.value = next.gestureTarget;
        gestureSettling.value = next.settling;
        gestureCrest.value = next.crest;
        gestureBoundaryBlocked.value = next.boundaryBlocked;
      })
        .then(() => {
          if (
            request !== flipRetirementRequest.current ||
            flipRef.current?.id !== activeFlip.id
          ) {
            logPageFlip("renderer-retire-stale", {
              request,
              turnId: activeFlip.id,
              activeTurn: flipRef.current?.id,
            });
            return;
          }
          logPageFlip("renderer-release", {
            request,
            turnId: activeFlip.id,
            source: activeFlip.source,
            to: target,
            progress: flipAnim.value,
          });
          writeFlipState(null, "renderer-release");
          writeFlipHandoffTarget(null, "renderer-release");
        })
        .catch((error: unknown) => {
          if (
            request !== flipRetirementRequest.current ||
            flipRef.current?.id !== activeFlip.id
          )
            return;
          logPageFlip("renderer-retire-error", {
            request,
            turnId: activeFlip.id,
            error: String(error),
          });
          // The completed animation is already at its terminal frame. If the
          // acknowledgement fails, unmount without changing progress; the
          // post-commit retirement barrier still performs the safe unlock.
          cancelAnimation(flipAnim);
          writeFlipState(null, "renderer-release-fallback");
          writeFlipHandoffTarget(null, "renderer-release-fallback");
        });
    },
    [
      flipAnim,
      flipLocked,
      flipMounted,
      gestureBoundaryBlocked,
      gestureCrest,
      gestureDirection,
      gestureProgress,
      gestureSettling,
      gestureTarget,
      writeFlipHandoffTarget,
      writeFlipState,
    ],
  );

  // Keep the completed shader frame mounted until React has committed the
  // target page underneath it. Removing both in one update intermittently
  // exposed a blank/stale Skia frame on slower commits.
  useEffect(() => {
    if (flipHandoffTarget === null || unit !== flipHandoffTarget || !flip)
      return;
    logPageFlip("handoff-committed", {
      turnId: flip.id,
      source: flip.source,
      from: flip.from,
      to: flip.to,
      progress: flipAnim.value,
    });
    const releaseTimer = setTimeout(() => {
      retireFlipRenderer(flip, flipHandoffTarget);
    }, 34);
    return () => clearTimeout(releaseTimer);
  }, [flip, flipAnim, flipHandoffTarget, retireFlipRenderer, unit]);

  const flipTo = useCallback(
    (to: number, source: "pagination", busyAlreadyClaimed = false) => {
      const lifecycle = flipLifecycle.current;
      if (
        (!busyAlreadyClaimed && (flipBusy.current || lifecycle !== "idle")) ||
        (busyAlreadyClaimed && (!flipBusy.current || lifecycle !== "preparing"))
      ) {
        logPageFlip("auto-skip-busy", {
          source,
          from: unitRef.current,
          to,
          lifecycle,
        });
        return false;
      }
      const from = unitRef.current;
      if (to === from || to < 0 || to > maxUnit) {
        logPageFlip("auto-skip-invalid-target", {
          source,
          from,
          to,
          maxUnit,
        });
        if (busyAlreadyClaimed) {
          flipLifecycle.current = "idle";
          flipBusy.current = false;
          flipLocked.value = 0;
        }
        return false;
      }
      flipBusy.current = true;
      flipLifecycle.current = "preparing";
      flipLocked.value = 1;
      const request = ++flipPreparationRequest.current;
      const nextFlip: FlipState = {
        id: ++flipSequence.current,
        source,
        from,
        to,
      };
      const requestedPadId = pad?.id;
      const requestedStyle = style;
      logPageFlip("auto-prepare-request", {
        request,
        turnId: nextFlip.id,
        source,
        from,
        to,
        previousProgress: flipAnim.value,
      });

      void runOnUIAsync(() => {
        "worklet";
        cancelAnimation(flipAnim);
        const next = pageFlipSharedStateForPhase(flipAnim.value, "prepare");
        flipAnim.value = next.progress;
        flipCurl.value = 0.82;
        flipLocked.value = next.locked;
        flipMounted.value = next.mounted;
        gestureDirection.value = next.direction;
        gestureProgress.value = next.gestureProgress;
        gestureTarget.value = next.gestureTarget;
        gestureSettling.value = next.settling;
        gestureCrest.value = next.crest;
        gestureBoundaryBlocked.value = next.boundaryBlocked;
        // Direction is shared with the shader before React mounts it. Reverse
        // turns otherwise render one frame with the previous forward mapping,
        // briefly exposing the destination page before the curl starts.
        gestureDirection.value = to > from ? 1 : -1;
      })
        .then(() => {
          const drawingState = useDrawings.getState();
          const currentPad = activePadOf(drawingState);
          const currentStyle = currentPad?.style ?? DEFAULT_PAD_STYLE;
          const currentMaxUnit =
            unitCount(activeDrawingsOf(drawingState).length, currentStyle) - 1;
          const stale =
            request !== flipPreparationRequest.current ||
            flipLifecycle.current !== "preparing" ||
            !flipBusy.current ||
            Boolean(flipRef.current) ||
            unitRef.current !== from ||
            currentPad?.id !== requestedPadId ||
            currentStyle !== requestedStyle ||
            to < 0 ||
            to > currentMaxUnit;

          if (stale) {
            logPageFlip("auto-prepare-stale", {
              request,
              turnId: nextFlip.id,
              from,
              to,
              currentUnit: unitRef.current,
              currentMaxUnit,
              lifecycle: flipLifecycle.current,
              activeTurn: flipRef.current?.id,
            });
            if (
              request === flipPreparationRequest.current &&
              !flipRef.current
            ) {
              flipLifecycle.current = "idle";
              flipBusy.current = false;
              autoFlipTarget.current = null;
              flipLocked.value = 0;
            }
            return;
          }

          flipLifecycle.current = "active";
          autoFlipTarget.current = to;
          logPageFlip("auto-request", {
            request,
            turnId: nextFlip.id,
            source,
            from,
            to,
            progress: flipAnim.value,
          });
          writeFlipState(nextFlip, "auto-request");
          impactHaptic(Haptics.ImpactFeedbackStyle.Light);
        })
        .catch((error: unknown) => {
          if (request !== flipPreparationRequest.current) return;
          logPageFlip("auto-prepare-error", {
            request,
            turnId: nextFlip.id,
            error: String(error),
          });
          flipLifecycle.current = "idle";
          flipBusy.current = false;
          autoFlipTarget.current = null;
          flipLocked.value = 0;
        });
      return true;
    },
    [
      flipAnim,
      flipCurl,
      flipLocked,
      flipMounted,
      gestureBoundaryBlocked,
      gestureCrest,
      gestureDirection,
      gestureProgress,
      gestureSettling,
      gestureTarget,
      maxUnit,
      pad?.id,
      style,
      writeFlipState,
    ],
  );

  const selectPaginationUnit = useCallback(
    (to: number) => {
      const from = unitRef.current;
      if (pending || flipRef.current || flipBusy.current || to === from) {
        logPageFlip("pagination-select-skip", {
          from,
          to,
          pending: Boolean(pending),
          activeTurn: flipRef.current?.id,
          busy: flipBusy.current,
        });
        return;
      }

      const capacity = unitCapacity(style);
      const sourceDrawings = drawings.slice(
        from * capacity,
        from * capacity + capacity,
      );
      const targetDrawings = drawings.slice(
        to * capacity,
        to * capacity + capacity,
      );
      const snapshotUris = Array.from(
        new Set(
          [...sourceDrawings, ...targetDrawings].map((drawing) => drawing.uri),
        ),
      );
      const request = ++paginationRequest.current;
      flipBusy.current = true;
      flipLifecycle.current = "preparing";
      flipLocked.value = 1;
      logPageFlip("pagination-select", {
        request,
        from,
        to,
        style,
        sourceImages: sourceDrawings.length,
        targetImages: targetDrawings.length,
        snapshotImages: snapshotUris.length,
      });

      void Promise.all(snapshotUris.map((uri) => preloadCachedImage(uri))).then(
        (images) => {
          const stale =
            paginationRequest.current !== request ||
            unitRef.current !== from ||
            Boolean(flipRef.current) ||
            Boolean(useDrawings.getState().pending);
          if (stale) {
            if (paginationRequest.current === request) {
              flipLifecycle.current = "idle";
              flipBusy.current = false;
              flipLocked.value = 0;
            }
            logPageFlip("pagination-preload-cancel", {
              request,
              from,
              to,
              currentUnit: unitRef.current,
              activeTurn: flipRef.current?.id,
            });
            return;
          }

          logPageFlip("pagination-preload-complete", {
            request,
            from,
            to,
            readyImages: images.filter(Boolean).length,
            snapshotImages: images.length,
          });
          flipTo(to, "pagination", true);
        },
      );
    },
    [drawings, flipLocked, flipTo, pending, style],
  );

  // Every turn is armed only after React has committed the two page snapshots.
  // Interactive progress is buffered on the UI thread until this handshake.
  useEffect(() => {
    if (!flip) return;
    const isAuto = autoFlipTarget.current === flip.to;
    const to = flip.to;
    const turnId = flip.id;
    const source = flip.source;
    const from = flip.from;
    if (isAuto) autoFlipTarget.current = null;
    const frame = requestAnimationFrame(() => {
      void runOnUIAsync(() => {
        "worklet";
        if (isAuto) {
          flipMounted.value = 1;
          runOnJS(logPageFlip)("auto-animation-start", {
            turnId,
            source,
            from,
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
          return;
        }

        // Read and write the gesture values in one UI-thread task. A JS-thread
        // read can lag behind onEnd and overwrite an active settle animation,
        // cancelling it and leaving the page frozen mid-curl.
        const bufferedProgress = gestureProgress.value;
        const alreadySettling = gestureSettling.value > 0;
        if (!alreadySettling) flipAnim.value = bufferedProgress;
        flipMounted.value = 1;
        runOnJS(logPageFlip)("gesture-renderer-armed", {
          turnId,
          source,
          from,
          to,
          bufferedProgress,
          alreadySettling,
        });
      }).catch((error: unknown) => {
        logPageFlip("renderer-arm-error", {
          turnId,
          source,
          from,
          to,
          error: String(error),
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    finishFlip,
    flip,
    flipAnim,
    flipMounted,
    gestureProgress,
    gestureSettling,
  ]);

  useEffect(() => {
    logPageFlip("store-snapshot", {
      padId: pad?.id,
      hydrated,
      style,
      drawings: drawings.length,
      maxUnit,
      lastUnit: lastUnitTrace,
      pending: Boolean(pending),
      pendingImage: pageFlipImageId(pending?.uri),
    });
  }, [drawings, hydrated, lastUnitTrace, maxUnit, pad?.id, pending, style]);

  useEffect(() => {
    stateCommitCount.current += 1;
    logPageFlip("state-commit", {
      commit: stateCommitCount.current,
      turnId: flip?.id,
      source: flip?.source,
      unit,
      visibleUnit,
      flipFrom: flip?.from,
      flipTo: flip?.to,
      handoffTarget: flipHandoffTarget,
      busy: flipBusy.current,
      pending: Boolean(pending),
      style,
      drawings: drawings.length,
      maxUnit,
      isLastUnit: unit === maxUnit,
      settledImages: settledUnitTrace,
      visibleImages: visibleUnitTrace,
      lastUnitImages: lastUnitTrace,
    });
  }, [
    drawings.length,
    flip,
    flipHandoffTarget,
    pending,
    style,
    unit,
    visibleUnit,
    maxUnit,
    settledUnitTrace,
    visibleUnitTrace,
    lastUnitTrace,
  ]);

  // React can commit the renderer removal before the native Skia view is
  // actually gone. Keep the terminal progress unchanged across two paint
  // boundaries, then unlock. The next turn resets progress on the UI thread
  // before mounting a new renderer.
  useEffect(() => {
    traceReactMounted.value = flip ? 1 : 0;
    traceTurnId.value = flip?.id ?? 0;
    logPageFlip("react-commit", {
      turnId: flip?.id,
      source: flip?.source,
      unit: unitRef.current,
      from: flip?.from,
      to: flip?.to,
      mounted: Boolean(flip),
      progress: flipAnim.value,
      lifecycle: flipLifecycle.current,
    });
    if (flip || flipLifecycle.current !== "retiring") return;

    const request = flipRetirementRequest.current;
    const terminalProgress = flipAnim.value;
    logPageFlip("renderer-retire-barrier-start", {
      request,
      unit: unitRef.current,
      terminalProgress,
      locked: flipLocked.value,
    });

    let settledFrame = 0;
    const committedFrame = requestAnimationFrame(() => {
      settledFrame = requestAnimationFrame(() => {
        void runOnUIAsync(() => {
          "worklet";
          const next = pageFlipSharedStateForPhase(flipAnim.value, "idle");
          flipAnim.value = next.progress;
          flipLocked.value = next.locked;
          flipMounted.value = next.mounted;
          gestureDirection.value = next.direction;
          gestureProgress.value = next.gestureProgress;
          gestureTarget.value = next.gestureTarget;
          gestureSettling.value = next.settling;
          gestureCrest.value = next.crest;
          gestureBoundaryBlocked.value = next.boundaryBlocked;
        })
          .then(() => {
            if (
              request !== flipRetirementRequest.current ||
              flipRef.current ||
              flipLifecycle.current !== "retiring"
            )
              return;
            flipLifecycle.current = "idle";
            flipBusy.current = false;
            logPageFlip("renderer-retired", {
              request,
              unit: unitRef.current,
              terminalProgress,
              resetProgress: flipAnim.value,
              locked: flipLocked.value,
            });
          })
          .catch((error: unknown) => {
            if (request !== flipRetirementRequest.current || flipRef.current)
              return;
            logPageFlip("renderer-retire-barrier-error", {
              request,
              error: String(error),
            });
            // No renderer is mounted after the paint barrier, so resetting the
            // shared state from JS cannot expose an intermediate shader frame.
            flipAnim.value = 0;
            flipLocked.value = 0;
            flipMounted.value = 0;
            gestureDirection.value = 0;
            gestureProgress.value = 0;
            gestureTarget.value = 0;
            gestureSettling.value = 0;
            gestureCrest.value = 0;
            gestureBoundaryBlocked.value = 0;
            flipLifecycle.current = "idle";
            flipBusy.current = false;
          });
      });
    });
    return () => {
      cancelAnimationFrame(committedFrame);
      if (settledFrame) cancelAnimationFrame(settledFrame);
    };
  }, [
    flip,
    flipAnim,
    flipLocked,
    flipMounted,
    gestureCrest,
    gestureBoundaryBlocked,
    gestureDirection,
    gestureProgress,
    gestureSettling,
    gestureTarget,
    traceReactMounted,
    traceTurnId,
  ]);

  // Switching sketchpads or changing layout invalidates the old unit mapping.
  // A style edit must never leave the renderer pointed beyond its new range.
  useEffect(() => {
    if (!pad) return;
    const previous = activePadStateRef.current;
    const padChanged = previous?.id !== pad.id;
    const styleChanged =
      previous?.id === pad.id && previous.style !== pad.style;
    if (!padChanged && !styleChanged) return;

    paginationRequest.current += 1;
    flipPreparationRequest.current += 1;
    flipRetirementRequest.current += 1;
    autoFlipTarget.current = null;
    const hadRenderer = Boolean(flipRef.current);
    flipLifecycle.current = hadRenderer ? "retiring" : "idle";
    if (hadRenderer) flipBusy.current = true;
    writeFlipHandoffTarget(null, styleChanged ? "style-change" : "pad-switch");
    cancelAnimation(flipAnim);
    writeFlipState(null, styleChanged ? "style-change" : "pad-switch");
    if (!hadRenderer) {
      flipBusy.current = false;
      flipLocked.value = 0;
      flipMounted.value = 0;
      gestureDirection.value = 0;
      gestureProgress.value = 0;
      gestureTarget.value = 0;
      gestureSettling.value = 0;
      gestureCrest.value = 0;
      gestureBoundaryBlocked.value = 0;
    }
    const isInitialPad = previous === null;
    activePadStateRef.current = { id: pad.id, style: pad.style };
    const drawingState = useDrawings.getState();
    jumpToUnit(
      finalSketchpadUnit(activeDrawingsOf(drawingState).length, pad.style),
      isInitialPad
        ? "startup-restore"
        : styleChanged
          ? "style-change-restore"
          : "pad-switch-restore",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad?.id, pad?.style]);

  useEffect(() => {
    if (flipRef.current || unitRef.current <= maxUnit) return;
    jumpToUnit(maxUnit, "unit-range-clamp");
  }, [jumpToUnit, maxUnit]);

  // A new scan is incoming: snap to the unit where it will land
  useEffect(() => {
    if (pending && !flip) {
      jumpToUnit(unitForIndex(drawings.length, style), "pending-arrival");
      // The flying cutout and the settled page use different Skia loaders.
      // Warm the page cache while the flight is visible so the handoff never
      // exposes an empty slot on the first render.
      void preloadCachedImage(pending.uri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(
    () => () => {
      paginationRequest.current += 1;
      flipPreparationRequest.current += 1;
      flipRetirementRequest.current += 1;
      cancelAnimation(flipAnim);
    },
    [flipAnim],
  );

  const handleLanded = useCallback(() => {
    const landing = useDrawings.getState().pending;
    if (!landing) return;

    void (async () => {
      await preloadCachedImage(landing.uri);

      // A profile or sketchpad switch may clear or replace the pending item
      // while decoding. Never commit an image into a different destination.
      if (useDrawings.getState().pending?.uri !== landing.uri) return;

      impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
      if (!commitPending()) return;
      const s = useDrawings.getState();
      const list = activeDrawingsOf(s);
      const st = activePadOf(s)?.style ?? DEFAULT_PAD_STYLE;
      jumpToUnit(
        unitForIndex(Math.max(0, list.length - 1), st),
        "drawing-landed",
      );
    })();
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
        const activeFlip = flipRef.current;
        logPageFlip("settle-finished", {
          turnId: activeFlip?.id,
          source: activeFlip?.source,
          to,
          completed,
          progress: flipAnim.value,
        });
        impactHaptic(Haptics.ImpactFeedbackStyle.Soft);
        finishFlip(to);
      } else {
        const activeFlip = flipRef.current;
        logPageFlip("settle-finished", {
          turnId: activeFlip?.id,
          source: activeFlip?.source,
          to,
          completed,
          progress: flipAnim.value,
        });
        writeFlipHandoffTarget(unitRef.current, "gesture-cancelled");
      }
    },
    [finishFlip, flipAnim, writeFlipHandoffTarget],
  );

  const handleGestureSettleResult = useCallback(
    (to: number, completed: boolean, generation: number, finished: boolean) => {
      const activeFlip = flipRef.current;
      const current =
        activeFlip?.source === "gesture" &&
        activeFlip.to === to &&
        flipLifecycle.current === "active";
      if (!current) {
        logPageFlip("settle-result-stale", {
          turnId: activeFlip?.id,
          to,
          generation,
          finished,
          lifecycle: flipLifecycle.current,
        });
        return;
      }
      if (finished) {
        settleFlip(to, completed);
        return;
      }

      logPageFlip("settle-interrupted", {
        turnId: activeFlip.id,
        to,
        generation,
        completed,
        progress: flipAnim.value,
      });
      void runOnUIAsync(() => {
        "worklet";
        if (
          gestureSettleGeneration.value !== generation ||
          gestureSettling.value <= 0 ||
          gestureTarget.value !== to
        ) {
          return false;
        }
        cancelAnimation(flipAnim);
        const terminal = completed ? 1 : 0;
        flipAnim.value = terminal;
        gestureProgress.value = terminal;
        flipMounted.value = 1;
        return true;
      })
        .then((recovered) => {
          const latest = flipRef.current;
          if (
            !recovered ||
            latest?.source !== "gesture" ||
            latest.to !== to ||
            flipLifecycle.current !== "active"
          ) {
            return;
          }
          logPageFlip("settle-recovered", {
            turnId: latest.id,
            to,
            generation,
            completed,
          });
          settleFlip(to, completed);
        })
        .catch((error: unknown) => {
          logPageFlip("settle-recovery-error", {
            turnId: flipRef.current?.id,
            to,
            generation,
            error: String(error),
          });
        });
    },
    [
      flipAnim,
      flipMounted,
      gestureProgress,
      gestureSettleGeneration,
      gestureSettling,
      gestureTarget,
      settleFlip,
    ],
  );

  const beginInteractiveFlip = useCallback(
    (to: number) => {
      const lifecycle = flipLifecycle.current;
      if (
        flipRef.current ||
        lifecycle === "active" ||
        lifecycle === "retiring"
      ) {
        logPageFlip("gesture-start-skip", {
          to,
          lifecycle,
          activeTurn: flipRef.current?.id,
          busy: flipBusy.current,
        });
        return;
      }
      if (lifecycle === "preparing") {
        // The UI-thread gesture already owns a clean zero-progress frame. Let
        // it supersede a not-yet-mounted pagination preparation.
        flipPreparationRequest.current += 1;
        logPageFlip("gesture-start-takeover", { to, lifecycle });
      }
      paginationRequest.current += 1;
      flipBusy.current = true;
      flipLifecycle.current = "active";
      autoFlipTarget.current = null;
      const nextFlip: FlipState = {
        id: ++flipSequence.current,
        source: "gesture",
        from: unitRef.current,
        to,
      };
      logPageFlip("gesture-start", {
        turnId: nextFlip.id,
        source: nextFlip.source,
        from: nextFlip.from,
        to,
      });
      writeFlipState(nextFlip, "gesture-start");
    },
    [writeFlipState],
  );
  const pageFlipBlocked = Boolean(pending);

  // Interactive updates and the continuous paper texture stay on the UI
  // thread. JS only mounts/unmounts the page snapshots and confirms landing.
  const pan = Gesture.Pan()
    .minDistance(6)
    .onBegin(() => {
      gestureBoundaryBlocked.value = 0;
    })
    .onUpdate((e) => {
      const delta = horizontalFlip ? e.translationX : e.translationY;
      if (gestureDirection.value === 0) {
        if (flipLocked.value > 0 || pageFlipBlocked || Math.abs(delta) < 6)
          return;
        const intent = resolvePageFlipIntent(
          delta,
          unit,
          maxUnit,
          gestureBoundaryBlocked.value > 0,
        );
        if (intent.blocked) {
          gestureBoundaryBlocked.value = 1;
          pageTurnBoundaryHaptic();
          return;
        }
        const dir = intent.direction as PageFlipDirection;
        const to = intent.target;

        const crossPosition = horizontalFlip ? e.y : e.x;
        flipCurl.value = Math.min(
          0.92,
          Math.max(
            0.08,
            (crossPosition - crossAxisOffset) / Math.max(1, crossAxisExtent),
          ),
        );
        flipLocked.value = 1;
        flipMounted.value = 0;
        gestureDirection.value = dir;
        gestureProgress.value = 0;
        gestureTarget.value = to;
        gestureSettling.value = 0;
        gestureSettleGeneration.value += 1;
        gestureCrest.value = 0;
        flipAnim.value = 0;
        const texture = pageTurnHapticTexture(0);
        updatePageTurnHaptic(texture.intensity, texture.sharpness);
        startPageTurnHaptic();
        runOnJS(beginInteractiveFlip)(to);
      }
      if (gestureSettling.value > 0) return;

      const crossPosition = horizontalFlip ? e.y : e.x;
      flipCurl.value = Math.min(
        0.92,
        Math.max(
          0.08,
          (crossPosition - crossAxisOffset) / Math.max(1, crossAxisExtent),
        ),
      );
      const progress = pageFlipProgress(
        delta,
        pageExtent,
        gestureDirection.value as PageFlipDirection,
      );
      gestureProgress.value = progress;
      if (flipMounted.value > 0) flipAnim.value = progress;
      const velocity = horizontalFlip ? e.velocityX : e.velocityY;
      const texture = pageTurnHapticTexture(progress, velocity);
      updatePageTurnHaptic(texture.intensity, texture.sharpness);

      if (gestureCrest.value === 0 && progress >= 0.5) {
        gestureCrest.value = 1;
        pageTurnCrestHaptic();
      } else if (gestureCrest.value === 1 && progress < 0.44) {
        gestureCrest.value = 0;
      }
    })
    .onEnd((e) => {
      stopPageTurnHaptic();
      const directionValue = gestureDirection.value;
      if (directionValue === 0 || gestureSettling.value > 0) return;
      const direction = directionValue as PageFlipDirection;
      gestureSettling.value = 1;
      const progress = gestureProgress.value;
      const velocity = horizontalFlip ? e.velocityX : e.velocityY;
      const complete = shouldCompletePageFlip(progress, velocity, direction);
      const target = gestureTarget.value;
      const generation = gestureSettleGeneration.value;
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
          runOnJS(handleGestureSettleResult)(
            target,
            complete,
            generation,
            finished === true,
          );
        },
      );
    })
    .onFinalize(() => {
      stopPageTurnHaptic();
      const directionValue = gestureDirection.value;
      if (directionValue === 0 || gestureSettling.value > 0) return;
      const direction = directionValue as PageFlipDirection;
      gestureSettling.value = 1;
      const progress = gestureProgress.value;
      const complete = shouldCompletePageFlip(progress, 0, direction);
      const target = gestureTarget.value;
      const generation = gestureSettleGeneration.value;
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
          runOnJS(handleGestureSettleResult)(
            target,
            complete,
            generation,
            finished === true,
          );
        },
      );
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success || pending || flip) return;
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

  return (
    <View style={styles.root}>
      <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]}>
        <HandwrittenTitle width={W} />

        {!viewing ? (
          <View style={styles.padPillWrap}>
            <NativeToolbarButton
              onPress={openDrawer}
              label={`Choose sketchpad. Current sketchpad: ${pad?.name ?? "My Book"}`}
              hint="Opens your sketchpad collection"
              icon={getPadIcon(pad?.icon).symbol}
              title={pad?.name ?? "My Book"}
              tintColor={pad?.coverColor ?? colors.bookBorder}
              foregroundColor={colors.ink}
              fallbackColor={colors.surface}
              style={styles.padPill}
              testID="sketchpad-selector-button"
            />
          </View>
        ) : null}

        {style === "spread" ? (
          <Scrapbook
            layout={spreadLayout}
            drawings={drawings}
            spread={unit}
            flip={flip}
            flipAnim={flipAnim}
            flipDirection={gestureDirection}
            flipCurl={flipCurl}
            coverColor={pad?.coverColor}
            pageColor={pad?.pageColor}
            design={pad?.design}
            border={pad?.border}
            decoration={pad?.decoration}
          />
        ) : (
          <FlipPad
            style={style}
            layout={padLayout}
            drawings={drawings}
            page={unit}
            flip={flip}
            flipAnim={flipAnim}
            flipDirection={gestureDirection}
            flipCurl={flipCurl}
            coverColor={pad?.coverColor}
            pageColor={pad?.pageColor}
            design={pad?.design}
            border={pad?.border}
            decoration={pad?.decoration}
          />
        )}

        {!viewing ? (
          <PagePagination
            currentUnit={visibleUnit}
            drawingCount={drawings.length}
            style={style}
            top={bookRect.y + bookRect.height + 10}
            coverColor={pad?.coverColor}
            design={pad?.design}
            disabled={Boolean(flip) || Boolean(pending)}
            onSelectUnit={selectPaginationUnit}
          />
        ) : null}

        {/* gesture surface over the book */}
        {!viewing ? (
          <GestureDetector gesture={bookGesture}>
            <View
              style={{
                position: "absolute",
                zIndex: 10,
                left: bookRect.x,
                top: bookRect.y,
                width: bookRect.width,
                height: bookRect.height,
              }}
            />
          </GestureDetector>
        ) : null}

        {pending ? (
          <FlyingCutout
            pending={pending}
            targetSlot={flySlot}
            onLanded={handleLanded}
          />
        ) : null}

        {!viewing ? (
          <View
            style={[styles.fabWrap, { bottom: bottomControls.captureBottom }]}
          >
            <NativeCaptureButton
              onPress={() => {
                if (requestArtworkCreation("artwork_limit"))
                  router.push("/scan");
              }}
              onLongPress={() => {
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
                          jumpToUnit(0, "clear-sketchpad");
                        },
                      },
                    ],
                  );
                })();
              }}
            />
          </View>
        ) : null}

        {viewing ? (
          <DrawingViewer
            drawing={viewing.drawing}
            originRect={viewing.rect}
            onClose={() => setViewing(null)}
            onOpenDetails={() => {
              const artworkId = viewing.drawing.id;
              setViewing(null);
              router.push({ pathname: "/artwork", params: { id: artworkId } });
            }}
            onDelete={() => {
              const artworkId = viewing.drawing.id;
              void requestArtworkDeletion(artworkId, deleteDrawing, () =>
                setViewing(null),
              );
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padPillWrap: {
    alignSelf: "flex-start",
    marginLeft: 20,
    marginTop: -8,
    maxWidth: 236,
    zIndex: 30,
    elevation: 30,
  },
  padPill: {
    maxWidth: 236,
  },
  fabWrap: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 40,
    elevation: 40,
    shadowColor: "#7A543B",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
});
