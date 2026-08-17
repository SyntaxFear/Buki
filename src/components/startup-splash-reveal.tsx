import MaskedView from "@react-native-masked-view/masked-view";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getHeaderMascotFrame } from "@/components/header-mascot-layout";
import { StartupSplashHandoffProvider } from "@/components/startup-splash-handoff";
import {
  STARTUP_SPLASH_IMAGE_ASPECT_RATIO,
  STARTUP_SPLASH_IMAGE_WIDTH,
  startupSplashFinalScale,
  startupSplashHeaderTransform,
  startupSplashTiming,
} from "@/components/startup-splash-motion";
import { colors } from "@/theme";

const SPLASH_BEAR = require("../../assets/images/buki-bear.png");
const AnimatedImage = Animated.createAnimatedComponent(Image);

type StartupSplashRevealProps = {
  children: ReactNode;
  transitionToHeaderMascot?: boolean;
};

export function StartupSplashReveal({
  children,
  transitionToHeaderMascot = false,
}: StartupSplashRevealProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const mounted = useRef(true);
  const handoffStarted = useRef(false);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [maskComplete, setMaskComplete] = useState(false);
  const [mascotArrived, setMascotArrived] = useState(false);
  const [headerMascotReady, setHeaderMascotReady] = useState(
    !transitionToHeaderMascot || reduceMotion,
  );
  const [revealComplete, setRevealComplete] = useState(false);
  const maskScale = useSharedValue(1);
  const mascotTranslateX = useSharedValue(0);
  const mascotTranslateY = useSharedValue(0);
  const mascotScale = useSharedValue(1);
  const mascotOpacity = useSharedValue(1);
  const reducedOverlayOpacity = useSharedValue(1);
  const finalScale = startupSplashFinalScale(width, height);
  const headerTransform = startupSplashHeaderTransform(
    width,
    height,
    getHeaderMascotFrame(width, insets.top),
  );

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const finishReveal = useCallback(() => {
    if (mounted.current) setRevealComplete(true);
  }, []);

  const markMaskComplete = useCallback(() => {
    if (mounted.current) setMaskComplete(true);
  }, []);

  const markMascotArrived = useCallback(() => {
    if (mounted.current) setMascotArrived(true);
  }, []);

  useEffect(() => {
    if (!surfaceReady) return;

    let cancelled = false;
    void (async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn("Buki native splash could not hide cleanly", error);
      }

      requestAnimationFrame(() => {
        if (!cancelled && mounted.current) setAnimationStarted(true);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [surfaceReady]);

  useEffect(() => {
    if (!animationStarted) return;

    if (reduceMotion) {
      reducedOverlayOpacity.value = withTiming(
        0,
        {
          duration: startupSplashTiming.reducedMotionFade,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.Never,
        },
        (finished) => {
          if (finished) runOnJS(finishReveal)();
        },
      );
      return;
    }

    const motionConfig = { reduceMotion: ReduceMotion.Never } as const;
    const travelDelay =
      startupSplashTiming.hold +
      startupSplashTiming.settle +
      startupSplashTiming.inhale;
    const headerSpring = {
      damping: 22,
      stiffness: 120,
      mass: 0.9,
      overshootClamping: true,
      energyThreshold: 0.001,
      ...motionConfig,
    } as const;

    maskScale.value = withDelay(
      startupSplashTiming.hold,
      withSequence(
        withTiming(0.92, {
          duration: startupSplashTiming.settle,
          easing: Easing.out(Easing.quad),
          ...motionConfig,
        }),
        withTiming(0.72, {
          duration: startupSplashTiming.inhale,
          easing: Easing.inOut(Easing.quad),
          ...motionConfig,
        }),
        withTiming(
          finalScale,
          {
            duration: startupSplashTiming.reveal,
            easing: Easing.out(Easing.cubic),
            ...motionConfig,
          },
          (finished) => {
            if (finished) runOnJS(markMaskComplete)();
          },
        ),
      ),
    );

    if (transitionToHeaderMascot) {
      mascotTranslateX.value = withDelay(
        travelDelay,
        withSpring(headerTransform.translateX, headerSpring),
      );
      mascotTranslateY.value = withDelay(
        travelDelay,
        withSpring(headerTransform.translateY, headerSpring),
      );
      mascotScale.value = withDelay(
        startupSplashTiming.hold,
        withSequence(
          withTiming(0.92, {
            duration: startupSplashTiming.settle,
            easing: Easing.out(Easing.quad),
            ...motionConfig,
          }),
          withTiming(0.72, {
            duration: startupSplashTiming.inhale,
            easing: Easing.inOut(Easing.quad),
            ...motionConfig,
          }),
          withSpring(
            headerTransform.scale,
            headerSpring,
            (finished) => {
              if (finished) runOnJS(markMascotArrived)();
            },
          ),
        ),
      );
    } else {
      mascotScale.value = withDelay(
        startupSplashTiming.hold,
        withSequence(
          withTiming(0.92, {
            duration: startupSplashTiming.settle,
            easing: Easing.out(Easing.quad),
            ...motionConfig,
          }),
          withTiming(0.72, {
            duration: startupSplashTiming.inhale,
            easing: Easing.inOut(Easing.quad),
            ...motionConfig,
          }),
          withTiming(1.08, {
            duration: startupSplashTiming.mascotFade,
            easing: Easing.out(Easing.cubic),
            ...motionConfig,
          }),
        ),
      );

      mascotOpacity.value = withDelay(
        travelDelay,
        withTiming(0, {
          duration: startupSplashTiming.mascotFade,
          easing: Easing.out(Easing.cubic),
          ...motionConfig,
        }),
      );
    }
  }, [
    animationStarted,
    finalScale,
    finishReveal,
    headerTransform.scale,
    headerTransform.translateX,
    headerTransform.translateY,
    markMaskComplete,
    markMascotArrived,
    maskScale,
    mascotOpacity,
    mascotScale,
    mascotTranslateX,
    mascotTranslateY,
    reduceMotion,
    reducedOverlayOpacity,
    transitionToHeaderMascot,
  ]);

  useEffect(() => {
    if (!maskComplete) return;

    if (!transitionToHeaderMascot) {
      requestAnimationFrame(finishReveal);
      return;
    }
    if (!mascotArrived || handoffStarted.current) return;

    handoffStarted.current = true;
    requestAnimationFrame(() => {
      setHeaderMascotReady(true);
      mascotOpacity.value = withDelay(
        32,
        withTiming(
          0,
          {
            duration: startupSplashTiming.handoffFade,
            easing: Easing.out(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          },
          (finished) => {
            if (finished) runOnJS(finishReveal)();
          },
        ),
      );
    });
  }, [
    finishReveal,
    maskComplete,
    mascotArrived,
    mascotOpacity,
    transitionToHeaderMascot,
  ]);

  const handleFirstLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      setSurfaceReady(true);
    },
    [],
  );

  const maskStyle = useAnimatedStyle(() => ({
    transform: [{ scale: maskScale.value }],
  }));

  const mascotStyle = useAnimatedStyle(() => ({
    opacity: mascotOpacity.value,
    transform: [
      { translateX: mascotTranslateX.value },
      { translateY: mascotTranslateY.value },
      { scale: mascotScale.value },
    ],
  }));

  const reducedOverlayStyle = useAnimatedStyle(() => ({
    opacity: reducedOverlayOpacity.value,
  }));

  if (reduceMotion) {
    return (
      <View style={styles.container} onLayout={handleFirstLayout}>
        <StartupSplashHandoffProvider
          value={{ headerMascotReady: true, sharedTransitionActive: false }}
        >
          {children}
        </StartupSplashHandoffProvider>
        {!revealComplete ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.reducedOverlay, reducedOverlayStyle]}
            testID="startup-splash-reduced-overlay"
          >
            <Image
              accessible={false}
              contentFit="contain"
              source={SPLASH_BEAR}
              style={styles.bear}
            />
          </Animated.View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={handleFirstLayout}>
      <MaskedView
        androidRenderingMode={revealComplete ? "hardware" : "software"}
        maskElement={
          maskComplete || revealComplete ? (
            <View style={styles.fullMask} />
          ) : (
            <View style={styles.maskWrapper}>
              <AnimatedImage
                accessible={false}
                contentFit="contain"
                source={SPLASH_BEAR}
                style={[styles.bear, maskStyle]}
                testID="startup-splash-mask"
              />
            </View>
          )
        }
        style={styles.maskedContent}
      >
        <StartupSplashHandoffProvider
          value={{
            headerMascotReady,
            sharedTransitionActive: transitionToHeaderMascot,
          }}
        >
          <View style={styles.content}>{children}</View>
        </StartupSplashHandoffProvider>
      </MaskedView>

      {!revealComplete ? (
        <AnimatedImage
          accessible={false}
          contentFit="contain"
          pointerEvents="none"
          source={SPLASH_BEAR}
          style={[styles.centeredBear, mascotStyle]}
          testID="startup-splash-bear"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  maskedContent: {
    flex: 1,
  },
  maskWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fullMask: {
    flex: 1,
    backgroundColor: "#000000",
  },
  bear: {
    width: STARTUP_SPLASH_IMAGE_WIDTH,
    aspectRatio: STARTUP_SPLASH_IMAGE_ASPECT_RATIO,
  },
  centeredBear: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: STARTUP_SPLASH_IMAGE_WIDTH,
    aspectRatio: STARTUP_SPLASH_IMAGE_ASPECT_RATIO,
    marginLeft: -(STARTUP_SPLASH_IMAGE_WIDTH / 2),
    marginTop:
      -(STARTUP_SPLASH_IMAGE_WIDTH / STARTUP_SPLASH_IMAGE_ASPECT_RATIO / 2),
  },
  reducedOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
