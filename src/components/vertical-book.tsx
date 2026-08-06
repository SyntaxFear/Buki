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
  useImage,
  vec,
  type SkImage,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { buildFaceSnapshot, CURL_EFFECT } from "@/components/curl-shader";
import type { FlipState } from "@/components/scrapbook";
import type { Drawing } from "@/store/drawings";
import { colors, padDarkColor } from "@/theme";
import { fitRect, type VerticalLayout } from "@/utils/book-layout";

interface Props {
  layout: VerticalLayout;
  drawings: Drawing[];
  /** Current page index; page i shows drawings[i], the last page is empty */
  page: number;
  flip: FlipState | null;
  flipAnim: SharedValue<number>;
  coverColor?: string;
}

/**
 * Portrait single-page pad bound at the top like a flip notepad. Pages curl
 * upward over the binding using the shared cylinder shader, transposed.
 */
export function VerticalBook({ layout, drawings, page, flip, flipAnim, coverColor }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { book, page: pageRect, slot, spineY } = layout;
  const cover = coverColor ?? colors.bookBorder;
  const coverDark = padDarkColor(cover);

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const underDrawing = flip ? (dir > 0 ? drawings[flip.to] : drawings[flip.from]) : drawings[page];
  const frontFace = flip ? (dir > 0 ? drawings[flip.from] : drawings[flip.to]) : undefined;

  const base = page - 1;
  const imgA = useImage(drawings[base]?.uri ?? null);
  const imgB = useImage(drawings[base + 1]?.uri ?? null);
  const imgC = useImage(drawings[base + 2]?.uri ?? null);
  const windowImages = [imgA, imgB, imgC];
  const imageFor = (drawing: Drawing | undefined): SkImage | null => {
    if (!drawing) return null;
    const off = drawings.indexOf(drawing) - base;
    return off >= 0 && off < 3 ? windowImages[off] : null;
  };

  const slotLocal = useMemo(
    () => ({
      x: slot.x - pageRect.x,
      y: slot.y - pageRect.y,
      width: slot.width,
      height: slot.height,
    }),
    [slot, pageRect],
  );

  const frontImage = imageFor(frontFace);
  const frontSnapshot = useMemo(() => {
    if (!flip || !CURL_EFFECT) return null;
    return buildFaceSnapshot(pageRect.width, pageRect.height, frontFace, frontImage, slotLocal);
  }, [flip, frontFace, frontImage, pageRect, slotLocal]);

  const curlUniforms = useDerivedValue(() => ({
    origin: [pageRect.x, spineY],
    size: [pageRect.height, pageRect.width],
    t: dir > 0 ? flipAnim.value : 1 - flipAnim.value,
    transposed: 1,
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
    const out: number[] = [];
    for (let x = pageRect.x + 18; x < pageRect.x + pageRect.width - 12; x += 30) {
      out.push(x);
    }
    return out;
  }, [pageRect]);

  const overhang = 30;

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
        color={colors.page}
      />
      <Path path={dotsPath} color="rgba(120,100,70,0.09)" />

      {/* underlying drawing (revealed by the flip, or the settled one) */}
      {underDrawing ? <UnderDrawing drawing={underDrawing} image={imageFor(underDrawing)} slot={slot} /> : null}

      {/* flipping page rolling up over the binding */}
      {flip && CURL_EFFECT && frontSnapshot ? (
        <Rect
          x={pageRect.x}
          y={spineY - overhang}
          width={pageRect.width}
          height={pageRect.height + overhang}
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

      {/* spiral binding rings over everything at the top edge */}
      {rings.map((x) => (
        <Group key={x}>
          <Circle cx={x} cy={spineY - 4} r={5.5} style="stroke" strokeWidth={2.6} color={coverDark} />
          <Circle cx={x} cy={spineY + 3} r={1.8} color="rgba(90,60,45,0.35)" />
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

function UnderDrawing({
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
