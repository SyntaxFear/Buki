import {
  Canvas,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Line,
  useImage,
  vec,
} from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { PendingDrawing } from "@/store/drawings";
import { colors } from "@/theme";
import { fitRect, type Rect as LayoutRect } from "@/utils/book-layout";

interface Props {
  pending: PendingDrawing;
  targetSlot: LayoutRect;
  onLanded: () => void;
}

const lerp = (a: number, b: number, t: number) => {
  "worklet";
  return a + (b - a) * t;
};

/**
 * The scanned cutout floats in large near the title — glowing white — then
 * arcs down onto the book's right page while its real colors fade back in.
 */
export function FlyingCutout({ pending, targetSlot, onLanded }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const image = useImage(pending.uri);
  const progress = useSharedValue(0);
  const landedRef = useRef(false);

  const startRect = useMemo(
    () => fitRect(pending.width, pending.height, { x: W * 0.18, y: H * 0.1, width: W * 0.64, height: H * 0.26 }),
    [pending.width, pending.height, W, H],
  );
  const endRect = useMemo(
    () => fitRect(pending.width, pending.height, targetSlot),
    [pending.width, pending.height, targetSlot],
  );

  const handleLanded = () => {
    if (landedRef.current) return;
    landedRef.current = true;
    onLanded();
  };

  useEffect(() => {
    if (!image) return;
    progress.value = 0;
    progress.value = withDelay(
      80,
      withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(handleLanded)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const rect = useDerivedValue(() => {
    const t = progress.value;
    const arc = -Math.sin(Math.PI * t) * H * 0.045;
    return {
      x: lerp(startRect.x, endRect.x, t),
      y: lerp(startRect.y, endRect.y, t) + arc,
      width: lerp(startRect.width, endRect.width, t),
      height: lerp(startRect.height, endRect.height, t),
    };
  });

  const origin = useDerivedValue(() => {
    const r = rect.value;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  const rotation = useDerivedValue(() => [
    { rotate: lerp(-0.05, (pending.rotation * Math.PI) / 180, progress.value) },
  ]);

  // White glow fading back to true colors mid-flight
  const matrix = useDerivedValue(() => {
    const t = progress.value;
    const w = 1 - Math.min(1, Math.max(0, (t - 0.3) / 0.5));
    const k = 1 - w;
    return [
      k, 0, 0, 0, w,
      0, k, 0, 0, w,
      0, 0, k, 0, w,
      0, 0, 0, 1, 0,
    ];
  });

  const burst = useMemo(() => {
    const cx = startRect.x + startRect.width / 2;
    const cy = startRect.y + startRect.height / 2;
    return Array.from({ length: 9 }, (_, i) => {
      const angle = (i / 9) * Math.PI * 2 + 0.4;
      return {
        angle,
        cx,
        cy,
        color: colors.confetti[i % colors.confetti.length],
        r0: Math.max(startRect.width, startRect.height) * 0.42,
      };
    });
  }, [startRect]);

  const burstOpacity = useDerivedValue(() =>
    Math.max(0, 1 - progress.value / 0.3) * Math.min(1, progress.value / 0.05),
  );

  if (!image) return null;

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: W, height: H }]} pointerEvents="none">
      {burst.map((b, i) => (
        <BurstTick key={i} {...b} progress={progress} opacity={burstOpacity} />
      ))}
      <Group transform={rotation} origin={origin}>
        <SkiaImage image={image} rect={rect} fit="fill">
          <ColorMatrix matrix={matrix} />
        </SkiaImage>
      </Group>
    </Canvas>
  );
}

function BurstTick({
  angle,
  cx,
  cy,
  color,
  r0,
  progress,
  opacity,
}: {
  angle: number;
  cx: number;
  cy: number;
  color: string;
  r0: number;
  progress: ReturnType<typeof useSharedValue<number>>;
  opacity: ReturnType<typeof useDerivedValue<number>>;
}) {
  const p1 = useDerivedValue(() => {
    const t = Math.min(1, progress.value / 0.3);
    const r = r0 + t * 26;
    return vec(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  });
  const p2 = useDerivedValue(() => {
    const t = Math.min(1, progress.value / 0.3);
    const r = r0 + t * 26 + 10;
    return vec(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  });
  return <Line p1={p1} p2={p2} color={color} strokeWidth={3} strokeCap="round" opacity={opacity} />;
}
