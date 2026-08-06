import {
  Canvas,
  Circle,
  Group,
  Path,
  Skia,
  Text as SkiaText,
  useFont,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { colors, PATRICK_HAND } from "@/theme";

const HEIGHT = 64;
const FONT_SIZE = 34;
const BASELINE = 42;
const LEFT = 22;

interface Props {
  width: number;
}

/**
 * "Bloombook" handwrites itself in two colored words, then a vine grows to
 * the right edge and a little flower blooms at its tip — mirroring the
 * original's "Make it Bloom" intro.
 */
export function HandwrittenTitle({ width }: Props) {
  const font = useFont(PATRICK_HAND, FONT_SIZE);

  const w1 = useSharedValue(0); // "Bloom" reveal
  const w2 = useSharedValue(0); // "book" reveal
  const vine = useSharedValue(0);
  const flower = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    w1.value = withDelay(350, withTiming(1, { duration: 620, easing: ease }));
    w2.value = withDelay(1000, withTiming(1, { duration: 520, easing: ease }));
    vine.value = withDelay(1600, withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }));
    flower.value = withDelay(2300, withSpring(1, { damping: 9, stiffness: 180 }));
  }, [w1, w2, vine, flower]);

  const word1 = "Bloom";
  const word2 = "book";
  const word1W = font ? font.getTextWidth(word1) : 0;
  const word2W = font ? font.getTextWidth(word2) : 0;
  const word2X = LEFT + word1W + 2;
  const textEnd = word2X + word2W;

  const vinePath = useMemo(() => {
    const p = Skia.Path.Make();
    const y = BASELINE + 6;
    const startX = textEnd + 10;
    const endX = width - 46;
    if (endX <= startX) return p;
    p.moveTo(startX, y);
    const span = endX - startX;
    p.cubicTo(
      startX + span * 0.3, y - 7,
      startX + span * 0.55, y + 7,
      startX + span * 0.8, y - 2,
    );
    p.quadTo(startX + span * 0.92, y - 6, endX, y - 4);
    return p;
  }, [textEnd, width]);

  const clip1 = useDerivedValue(() =>
    Skia.XYWHRect(LEFT - 4, 0, (word1W + 10) * w1.value, HEIGHT),
  );
  const clip2 = useDerivedValue(() =>
    Skia.XYWHRect(word2X - 2, 0, (word2W + 10) * w2.value, HEIGHT),
  );
  const flowerTransform = useDerivedValue(() => [{ scale: flower.value }]);

  // A little pen tip riding the reveal edge sells the "being written" feel
  const pen1X = useDerivedValue(() => LEFT + word1W * Math.min(1, w1.value));
  const pen1Opacity = useDerivedValue(() => (w1.value > 0.02 && w1.value < 0.98 ? 1 : 0));
  const pen2X = useDerivedValue(() => word2X + word2W * Math.min(1, w2.value));
  const pen2Opacity = useDerivedValue(() => (w2.value > 0.02 && w2.value < 0.98 ? 1 : 0));

  const flowerX = width - 40;
  const flowerY = BASELINE + 1;

  if (!font) return null;

  return (
    <Canvas style={{ width, height: HEIGHT }}>
      <Group clip={clip1}>
        <SkiaText x={LEFT} y={BASELINE} text={word1} font={font} color={colors.titleGreen} />
      </Group>
      <Group clip={clip2}>
        <SkiaText x={word2X} y={BASELINE} text={word2} font={font} color={colors.titleCoral} />
      </Group>
      <Circle cx={pen1X} cy={BASELINE - 10} r={2.6} color={colors.titleGreen} opacity={pen1Opacity} />
      <Circle cx={pen2X} cy={BASELINE - 10} r={2.6} color={colors.titleCoral} opacity={pen2Opacity} />
      <Path
        path={vinePath}
        color={colors.vine}
        style="stroke"
        strokeWidth={2.4}
        strokeCap="round"
        start={0}
        end={vine}
      />
      <Group transform={flowerTransform} origin={{ x: flowerX, y: flowerY }}>
        {[0, 72, 144, 216, 288].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <Circle
              key={angle}
              cx={flowerX + Math.cos(rad) * 5.5}
              cy={flowerY + Math.sin(rad) * 5.5}
              r={4}
              color={colors.flower}
            />
          );
        })}
        <Circle cx={flowerX} cy={flowerY} r={3.2} color={colors.tapeYellow} />
      </Group>
    </Canvas>
  );
}
