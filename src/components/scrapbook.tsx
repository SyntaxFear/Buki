import {
  Blur,
  Canvas,
  DashPathEffect,
  Group,
  Image as SkiaImage,
  ImageShader,
  Line,
  LinearGradient,
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

import { buildFaceSnapshot, CURL_EFFECT } from "@/components/curl-shader";
import type { Drawing } from "@/store/drawings";
import { colors, padDarkColor } from "@/theme";
import { useImageCache } from "@/utils/image-cache";
import { fitRect, type BookLayout, type Rect as LayoutRect } from "@/utils/book-layout";

export interface FlipState {
  from: number;
  to: number;
}

interface Props {
  layout: BookLayout;
  drawings: Drawing[];
  /** Current spread index; spread i shows drawings[2i] (left) and drawings[2i+1] (right) */
  spread: number;
  flip: FlipState | null;
  flipAnim: SharedValue<number>;
  coverColor?: string;
  pageColor?: string;
}

function DrawingOnPage({
  drawing,
  image,
  slot,
}: {
  drawing: Drawing;
  image: SkImage | null;
  slot: LayoutRect;
}) {
  const rect = fitRect(drawing.width, drawing.height, slot);
  if (!image) return null;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    <Group transform={[{ rotate: (drawing.rotation * Math.PI) / 180 }]} origin={{ x: cx, y: cy }}>
      <SkiaImage
        image={image}
        rect={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
        fit="contain"
      />
    </Group>
  );
}

/** Short colored sparkle ticks, like the accents around the original's pages. */
function Confetti({ cx, cy, seed }: { cx: number; cy: number; seed: number }) {
  const ticks = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((seed * 37 + i * 61) % 360) * (Math.PI / 180);
      const r0 = 6 + ((seed + i * 13) % 5);
      const len = 7 + ((seed * 3 + i * 7) % 6);
      out.push({
        x1: cx + Math.cos(angle) * r0,
        y1: cy + Math.sin(angle) * r0,
        x2: cx + Math.cos(angle) * (r0 + len),
        y2: cy + Math.sin(angle) * (r0 + len),
        color: colors.confetti[(seed + i) % colors.confetti.length],
      });
    }
    return out;
  }, [cx, cy, seed]);

  return (
    <>
      {ticks.map((t, i) => (
        <Line
          key={i}
          p1={vec(t.x1, t.y1)}
          p2={vec(t.x2, t.y2)}
          color={t.color}
          strokeWidth={2.6}
          strokeCap="round"
          opacity={0.95}
        />
      ))}
    </>
  );
}

export function Scrapbook({ layout, drawings, spread, flip, flipAnim, coverColor, pageColor }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { book, leftPage, rightPage, leftSlot, rightSlot, spineX } = layout;
  const cover = coverColor ?? colors.bookBorder;
  const paper = pageColor ?? colors.page;
  const coverDark = padDarkColor(cover);

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const fromIdx = flip ? flip.from : spread;
  const toIdx = flip ? flip.to : spread;

  // Which drawings play which role during a flip (see design note in
  // curl-shader.ts): the turning page's front is the outgoing right page and
  // its back is the incoming left page.
  const staticLeft = flip ? (dir > 0 ? drawings[2 * fromIdx] : drawings[2 * toIdx]) : drawings[2 * spread];
  const underRight = flip
    ? dir > 0
      ? drawings[2 * toIdx + 1]
      : drawings[2 * fromIdx + 1]
    : drawings[2 * spread + 1];
  const frontFace = flip ? (dir > 0 ? drawings[2 * fromIdx + 1] : drawings[2 * toIdx + 1]) : undefined;
  const backFace = flip ? (dir > 0 ? drawings[2 * toIdx] : drawings[2 * fromIdx]) : undefined;

  // Persistent cache: every drawing in the pad stays decoded, so flips and
  // spread changes render synchronously with no image pop-in
  const lookup = useImageCache(drawings.map((d) => d.uri));
  const imageFor = (drawing: Drawing | undefined): SkImage | null =>
    drawing ? lookup(drawing.uri) : null;

  const dotsPath = useMemo(() => {
    const p = Skia.Path.Make();
    for (let y = leftPage.y + 12; y < leftPage.y + leftPage.height - 6; y += 17) {
      for (let x = leftPage.x + 12; x < rightPage.x + rightPage.width - 6; x += 17) {
        p.addCircle(x, y, 0.9);
      }
    }
    return p;
  }, [leftPage, rightPage]);

  const spinePath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(spineX, book.y + 16);
    p.lineTo(spineX, book.y + book.height - 16);
    return p;
  }, [spineX, book]);

  const slotLocal = useMemo(
    () => ({
      x: rightSlot.x - rightPage.x,
      y: rightSlot.y - rightPage.y,
      width: rightSlot.width,
      height: rightSlot.height,
    }),
    [rightSlot, rightPage],
  );

  const frontImage = imageFor(frontFace);
  const backImage = imageFor(backFace);

  const frontSnapshot = useMemo(() => {
    if (!flip || !CURL_EFFECT) return null;
    const items = frontFace ? [{ drawing: frontFace, image: frontImage, slotLocal }] : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, paper);
  }, [flip, frontFace, frontImage, rightPage, slotLocal]);

  const backSnapshot = useMemo(() => {
    if (!flip || !CURL_EFFECT) return null;
    const items = backFace ? [{ drawing: backFace, image: backImage, slotLocal }] : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, paper);
  }, [flip, backFace, backImage, rightPage, slotLocal]);

  const curlUniforms = useDerivedValue(() => ({
    origin: [leftPage.x, rightPage.y],
    size: [rightPage.width, rightPage.height],
    t: dir > 0 ? flipAnim.value : 1 - flipAnim.value,
    transposed: 0,
    spineOff: rightPage.width,
    hasBack: 1,
  }));

  const pageRadius = 8;

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: screenW, height: screenH }]} pointerEvents="none">
      {/* soft drop shadow under the book */}
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

      {/* pages */}
      <RoundedRect
        x={leftPage.x}
        y={leftPage.y}
        width={rightPage.x + rightPage.width - leftPage.x}
        height={leftPage.height}
        r={pageRadius}
        color={paper}
      />
      <Path path={dotsPath} color="rgba(120,100,70,0.09)" />

      {/* center crease shading */}
      <Rect x={spineX - 26} y={leftPage.y} width={52} height={leftPage.height} opacity={0.16}>
        <LinearGradient
          start={vec(spineX - 26, 0)}
          end={vec(spineX + 26, 0)}
          colors={["transparent", "rgba(90,70,50,0.55)", "transparent"]}
        />
      </Rect>

      {/* dotted spine */}
      <Path path={spinePath} style="stroke" strokeWidth={2.6} strokeCap="round" color={colors.spineDot}>
        <DashPathEffect intervals={[0.1, 9]} />
      </Path>

      {/* left page drawing (static through a flip until the page lands) */}
      {staticLeft ? <DrawingOnPage drawing={staticLeft} image={imageFor(staticLeft)} slot={leftSlot} /> : null}

      {/* right page drawing being revealed (or the settled one) */}
      {underRight ? <DrawingOnPage drawing={underRight} image={imageFor(underRight)} slot={rightSlot} /> : null}

      {/* flipping page */}
      {flip && CURL_EFFECT && frontSnapshot && backSnapshot ? (
        <Rect
          x={leftPage.x}
          y={rightPage.y}
          width={leftPage.width + rightPage.width}
          height={rightPage.height}
        >
          <Shader source={CURL_EFFECT} uniforms={curlUniforms}>
            <ImageShader
              image={frontSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: rightPage.width, height: rightPage.height }}
            />
            <ImageShader
              image={backSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: rightPage.width, height: rightPage.height }}
            />
          </Shader>
        </Rect>
      ) : null}

      {/* washi tapes */}
      <Group transform={[{ rotate: -0.21 }]} origin={{ x: leftPage.x + 34, y: book.y + 6 }}>
        <RoundedRect x={leftPage.x + 6} y={book.y - 4} width={58} height={20} r={3} color={colors.tapeTeal} opacity={0.92} />
      </Group>
      <Group
        transform={[{ rotate: 0.18 }]}
        origin={{ x: rightPage.x + rightPage.width - 36, y: book.y + book.height - 8 }}
      >
        <RoundedRect
          x={rightPage.x + rightPage.width - 66}
          y={book.y + book.height - 18}
          width={58}
          height={20}
          r={3}
          color={colors.tapeYellow}
          opacity={0.92}
        />
      </Group>

      {/* sparkle accents */}
      <Confetti cx={rightPage.x + rightPage.width - 26} cy={rightPage.y + 22} seed={3} />
      <Confetti cx={leftPage.x + 24} cy={leftPage.y + leftPage.height - 26} seed={11} />
    </Canvas>
  );
}
