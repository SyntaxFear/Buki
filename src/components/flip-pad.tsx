import {
  Blur,
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Image as SkiaImage,
  ImageShader,
  Line,
  Path,
  Rect,
  RoundedRect,
  Shader,
  Skia,
  vec,
  type SkImage,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { buildFaceSnapshot, CURL_EFFECT, type FaceItem } from "@/components/curl-shader";
import type { FlipState } from "@/components/scrapbook";
import type { Drawing, PadStyle } from "@/store/drawings";
import { colors, padDarkColor } from "@/theme";
import { fitRect, unitCapacity, type PadPageLayout } from "@/utils/book-layout";
import { useImageCache } from "@/utils/image-cache";

interface Props {
  style: Exclude<PadStyle, "spread">;
  layout: PadPageLayout;
  drawings: Drawing[];
  /** Current page index; page i shows drawings[i*cap .. i*cap+cap-1] */
  page: number;
  flip: FlipState | null;
  flipAnim: SharedValue<number>;
  coverColor?: string;
  pageColor?: string;
}

/**
 * Single-page pad bound at the top (vertical, grid) or the left (album).
 * Pages curl over the binding using the shared cylinder shader — transposed
 * for top bindings, straight for left bindings.
 */
export function FlipPad({ style, layout, drawings, page, flip, flipAnim, coverColor, pageColor }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { book, page: pageRect, slots, binding, spine } = layout;
  const cover = coverColor ?? colors.bookBorder;
  const paper = pageColor ?? colors.page;
  const coverDark = padDarkColor(cover);
  const cap = unitCapacity(style);

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const underUnit = flip ? (dir > 0 ? flip.to : flip.from) : page;
  const frontUnit = flip ? (dir > 0 ? flip.from : flip.to) : null;

  const lookup = useImageCache(drawings.map((d) => d.uri));
  const imageFor = (drawing: Drawing | undefined): SkImage | null =>
    drawing ? lookup(drawing.uri) : null;
  const unitDrawings = (unit: number | null): Drawing[] => {
    if (unit === null) return [];
    return slots
      .map((_, i) => drawings[unit * cap + i])
      .filter((d): d is Drawing => Boolean(d));
  };

  const slotsLocal = useMemo(
    () =>
      slots.map((slot) => ({
        x: slot.x - pageRect.x,
        y: slot.y - pageRect.y,
        width: slot.width,
        height: slot.height,
      })),
    [slots, pageRect],
  );

  const frontSnapshot = useMemo(() => {
    if (!flip || !CURL_EFFECT || frontUnit === null) return null;
    const items: FaceItem[] = [];
    slots.forEach((_, i) => {
      const d = drawings[frontUnit * cap + i];
      if (d) items.push({ drawing: d, image: imageFor(d), slotLocal: slotsLocal[i] });
    });
    return buildFaceSnapshot(pageRect.width, pageRect.height, items, paper);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flip, frontUnit, drawings, pageRect, slotsLocal, lookup]);

  const curlUniforms = useDerivedValue(() => ({
    origin: binding === "top" ? [pageRect.x, spine] : [spine, pageRect.y],
    size:
      binding === "top"
        ? [pageRect.height, pageRect.width]
        : [pageRect.width, pageRect.height],
    t: dir > 0 ? flipAnim.value : 1 - flipAnim.value,
    transposed: binding === "top" ? 1 : 0,
    spineOff: 0,
    hasBack: 0,
  }));

  const dotsPath = useMemo(() => {
    const p = Skia.Path.Make();
    for (let y = pageRect.y + 14; y < pageRect.y + pageRect.height - 6; y += 17) {
      for (let x = pageRect.x + 12; x < pageRect.x + pageRect.width - 6; x += 17) {
        p.addCircle(x, y, 0.9);
      }
    }
    return p;
  }, [pageRect]);

  const rings = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    if (binding === "top") {
      for (let x = pageRect.x + 18; x < pageRect.x + pageRect.width - 12; x += 30) {
        out.push({ x, y: spine - 4 });
      }
    } else {
      for (let y = pageRect.y + 18; y < pageRect.y + pageRect.height - 12; y += 30) {
        out.push({ x: spine - 4, y });
      }
    }
    return out;
  }, [binding, pageRect, spine]);

  const overhang = 30;
  const underItems = unitDrawings(underUnit);

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: screenW, height: screenH }]} pointerEvents="none">
      {/* soft drop shadow */}
      <RoundedRect
        x={book.x + 2}
        y={book.y + 10}
        width={book.width - 4}
        height={book.height}
        r={16}
        color="rgba(90,70,50,0.30)"
      >
        <Blur blur={14} />
      </RoundedRect>

      {/* cover + stitched edge */}
      <RoundedRect x={book.x} y={book.y} width={book.width} height={book.height} r={14} color={cover} />
      <RoundedRect
        x={book.x + 5}
        y={book.y + 5}
        width={book.width - 10}
        height={book.height - 10}
        r={11}
        style="stroke"
        strokeWidth={1.8}
        color={coverDark}
        opacity={0.65}
      >
        <DashPathEffect intervals={[7, 5]} />
      </RoundedRect>

      {/* page */}
      <RoundedRect
        x={pageRect.x}
        y={pageRect.y}
        width={pageRect.width}
        height={pageRect.height}
        r={8}
        color={paper}
      />
      <Path path={dotsPath} color="rgba(120,100,70,0.09)" />

      {/* underlying drawings (revealed by the flip, or the settled unit) */}
      {underItems.map((d) => {
        const slotIdx = (drawings.indexOf(d)) % cap;
        return <SlotDrawing key={d.id} drawing={d} image={imageFor(d)} slot={slots[slotIdx]} />;
      })}

      {/* flipping page curling over the binding */}
      {flip && CURL_EFFECT && frontSnapshot ? (
        <Rect
          x={binding === "top" ? pageRect.x : spine - overhang}
          y={binding === "top" ? spine - overhang : pageRect.y}
          width={binding === "top" ? pageRect.width : pageRect.width + overhang}
          height={binding === "top" ? pageRect.height + overhang : pageRect.height}
        >
          <Shader source={CURL_EFFECT} uniforms={curlUniforms}>
            <ImageShader
              image={frontSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: pageRect.width, height: pageRect.height }}
            />
            <ImageShader
              image={frontSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: pageRect.width, height: pageRect.height }}
            />
          </Shader>
        </Rect>
      ) : null}

      {/* binding rings over everything */}
      {rings.map((r, i) => (
        <Group key={i}>
          <Circle cx={r.x} cy={r.y} r={5.5} style="stroke" strokeWidth={2.6} color={coverDark} />
          <Circle
            cx={binding === "top" ? r.x : r.x + 7}
            cy={binding === "top" ? r.y + 7 : r.y}
            r={1.8}
            color="rgba(90,60,45,0.35)"
          />
        </Group>
      ))}

      {/* small tape + sparkle accents */}
      <Group transform={[{ rotate: 0.18 }]} origin={{ x: book.x + book.width - 36, y: book.y + book.height - 8 }}>
        <RoundedRect
          x={book.x + book.width - 62}
          y={book.y + book.height - 16}
          width={52}
          height={18}
          r={3}
          color={colors.tapeYellow}
          opacity={0.92}
        />
      </Group>
      <Sparkle cx={book.x + 20} cy={book.y + book.height - 24} />
    </Canvas>
  );
}

function SlotDrawing({
  drawing,
  image,
  slot,
}: {
  drawing: Drawing;
  image: SkImage | null;
  slot: { x: number; y: number; width: number; height: number };
}) {
  const rect = fitRect(drawing.width, drawing.height, slot);
  if (!image) return null;
  return (
    <Group
      transform={[{ rotate: (drawing.rotation * Math.PI) / 180 }]}
      origin={{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }}
    >
      <SkiaImage
        image={image}
        rect={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
        fit="contain"
      />
    </Group>
  );
}

function Sparkle({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <Line
            key={angle}
            p1={vec(cx + Math.cos(rad) * 7, cy + Math.sin(rad) * 7)}
            p2={vec(cx + Math.cos(rad) * 15, cy + Math.sin(rad) * 15)}
            color={colors.confetti[i % colors.confetti.length]}
            strokeWidth={2.6}
            strokeCap="round"
            opacity={0.95}
          />
        );
      })}
    </>
  );
}
