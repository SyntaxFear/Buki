import {
  Canvas,
  Group,
  Image,
  Path,
  Skia,
  Text as SkiaText,
  useFont,
  useImage,
} from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { BUKI_BEAR_IMAGE } from "@/components/buki-bear";
import {
  HEADER_MASCOT_HEIGHT,
  HEADER_MASCOT_WIDTH,
  getHeaderMascotFrame,
} from "@/components/header-mascot-layout";
import { useStartupSplashHandoff } from "@/components/startup-splash-handoff";
import { colors, PATRICK_HAND } from "@/theme";

const HEIGHT = 82;
const FONT_SIZE = 44;
const BASELINE = 53;
const LEFT = 20;
const TRAIL_BEAR_GAP = 8;
let titleAnimationPlayed = false;

interface Props {
  width: number;
}

/**
 * Buki wordmark: four friendly letter colors, a paired garden trail, and the
 * smiling bear from the app icon. The trail reserves a real gap before the
 * mascot, so neither stroke can show through its transparent image bounds.
 */
export function HandwrittenTitle({ width }: Props) {
  const font = useFont(PATRICK_HAND, FONT_SIZE);
  const bear = useImage(BUKI_BEAR_IMAGE);
  const { headerMascotReady, sharedTransitionActive } =
    useStartupSplashHandoff();
  const [animateOnMount] = useState(() => {
    const animate = !titleAnimationPlayed;
    titleAnimationPlayed = true;
    return animate;
  });

  const b = useSharedValue(animateOnMount ? 0 : 1);
  const u = useSharedValue(animateOnMount ? 0 : 1);
  const k = useSharedValue(animateOnMount ? 0 : 1);
  const i = useSharedValue(animateOnMount ? 0 : 1);
  const trail = useSharedValue(animateOnMount ? 0 : 1);
  const bearPop = useSharedValue(
    sharedTransitionActive ? 0 : animateOnMount ? 0 : 1,
  );

  useEffect(() => {
    if (!animateOnMount) return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (!mounted) return;
        if (reduceMotion) {
          b.value = 1;
          u.value = 1;
          k.value = 1;
          i.value = 1;
          trail.value = 1;
          return;
        }

        const ease = Easing.out(Easing.cubic);
        b.value = withDelay(
          180,
          withTiming(1, { duration: 280, easing: ease }),
        );
        u.value = withDelay(
          380,
          withTiming(1, { duration: 260, easing: ease }),
        );
        k.value = withDelay(
          570,
          withTiming(1, { duration: 260, easing: ease }),
        );
        i.value = withDelay(
          760,
          withTiming(1, { duration: 220, easing: ease }),
        );
        trail.value = withDelay(
          920,
          withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        );
      });

    return () => {
      mounted = false;
    };
  }, [
    animateOnMount,
    b,
    i,
    k,
    trail,
    u,
  ]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (!mounted) return;

        if (sharedTransitionActive) {
          if (!headerMascotReady) {
            bearPop.value = 0;
            return;
          }
          bearPop.value = withTiming(1, {
            duration: reduceMotion ? 0 : 90,
            easing: Easing.out(Easing.quad),
          });
          return;
        }

        if (!animateOnMount || reduceMotion) {
          bearPop.value = 1;
          return;
        }
        bearPop.value = withDelay(
          1380,
          withTiming(1, {
            duration: 240,
            easing: Easing.out(Easing.cubic),
          }),
        );
      });

    return () => {
      mounted = false;
    };
  }, [animateOnMount, bearPop, headerMascotReady, sharedTransitionActive]);

  const letters = ["B", "u", "k", "i"] as const;
  const widths = letters.map((letter) =>
    font ? font.getTextWidth(letter) : 0,
  );
  const positions = [
    LEFT,
    LEFT + widths[0] - 1,
    LEFT + widths[0] + widths[1] - 3,
    LEFT + widths[0] + widths[1] + widths[2] - 5,
  ];
  const textEnd = positions[3] + widths[3];
  const mascotFrame = getHeaderMascotFrame(width);
  const bearX = mascotFrame.x;
  const bearY = mascotFrame.y;
  const trailEndX = bearX - TRAIL_BEAR_GAP;

  const mainTrail = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const startX = textEnd + 13;
    const endX = trailEndX;
    const y = 50;
    if (endX <= startX) return p.detach();
    const span = endX - startX;
    p.moveTo(startX, y);
    p.cubicTo(
      startX + span * 0.23,
      y + 3,
      startX + span * 0.52,
      y - 15,
      startX + span * 0.72,
      y - 13,
    );
    p.cubicTo(
      startX + span * 0.84,
      y - 12,
      startX + span * 0.92,
      y - 9,
      endX,
      y - 10,
    );
    return p.detach();
  }, [textEnd, trailEndX]);

  const softTrail = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const startX = textEnd + 13;
    const endX = trailEndX;
    const y = 59;
    if (endX <= startX) return p.detach();
    const span = endX - startX;
    p.moveTo(startX, y);
    p.cubicTo(
      startX + span * 0.24,
      y + 4,
      startX + span * 0.53,
      y - 14,
      startX + span * 0.73,
      y - 12,
    );
    p.cubicTo(
      startX + span * 0.84,
      y - 11,
      startX + span * 0.93,
      y - 6,
      endX,
      y - 7,
    );
    return p.detach();
  }, [textEnd, trailEndX]);

  const clipB = useDerivedValue(() =>
    Skia.XYWHRect(positions[0] - 4, 0, (widths[0] + 8) * b.value, HEIGHT),
  );
  const clipU = useDerivedValue(() =>
    Skia.XYWHRect(positions[1] - 3, 0, (widths[1] + 8) * u.value, HEIGHT),
  );
  const clipK = useDerivedValue(() =>
    Skia.XYWHRect(positions[2] - 3, 0, (widths[2] + 8) * k.value, HEIGHT),
  );
  const clipI = useDerivedValue(() =>
    Skia.XYWHRect(positions[3] - 3, 0, (widths[3] + 10) * i.value, HEIGHT),
  );
  const bearTransform = useDerivedValue(() => [{ scale: bearPop.value }]);

  if (!font) return null;

  return (
    <Canvas style={{ width, height: HEIGHT }}>
      <Group clip={clipB}>
        <SkiaText
          x={positions[0] + 1.5}
          y={BASELINE + 2.5}
          text="B"
          font={font}
          color="rgba(56,57,48,0.18)"
        />
        <SkiaText
          x={positions[0]}
          y={BASELINE}
          text="B"
          font={font}
          color={colors.titleCoral}
        />
      </Group>
      <Group clip={clipU}>
        <SkiaText
          x={positions[1] + 1.5}
          y={BASELINE + 2.5}
          text="u"
          font={font}
          color="rgba(56,57,48,0.18)"
        />
        <SkiaText
          x={positions[1]}
          y={BASELINE}
          text="u"
          font={font}
          color={colors.titleTeal}
        />
      </Group>
      <Group clip={clipK}>
        <SkiaText
          x={positions[2] + 1.5}
          y={BASELINE + 2.5}
          text="k"
          font={font}
          color="rgba(56,57,48,0.18)"
        />
        <SkiaText
          x={positions[2]}
          y={BASELINE}
          text="k"
          font={font}
          color={colors.titleYellow}
        />
      </Group>
      <Group clip={clipI}>
        <SkiaText
          x={positions[3] + 1.5}
          y={BASELINE + 2.5}
          text="i"
          font={font}
          color="rgba(56,57,48,0.18)"
        />
        <SkiaText
          x={positions[3]}
          y={BASELINE}
          text="i"
          font={font}
          color={colors.titleBlue}
        />
      </Group>

      <Path
        path={softTrail}
        color={colors.vineSoft}
        style="stroke"
        strokeWidth={3.1}
        strokeCap="round"
        start={0}
        end={trail}
      />
      <Path
        path={mainTrail}
        color={colors.vine}
        style="stroke"
        strokeWidth={3.3}
        strokeCap="round"
        start={0}
        end={trail}
      />

      {bear ? (
        <Group
          transform={bearTransform}
          origin={{
            x: bearX + HEADER_MASCOT_WIDTH / 2,
            y: bearY + HEADER_MASCOT_HEIGHT / 2,
          }}
        >
          <Image
            image={bear}
            x={bearX}
            y={bearY}
            width={HEADER_MASCOT_WIDTH}
            height={HEADER_MASCOT_HEIGHT}
            fit="contain"
          />
        </Group>
      ) : null}
    </Canvas>
  );
}
