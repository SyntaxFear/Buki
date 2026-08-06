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
  useImage,
  vec,
  type SkImage,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import type { Drawing } from "@/store/drawings";
import { colors } from "@/theme";
import { fitRect, type BookLayout, type Rect as LayoutRect } from "@/utils/book-layout";

export interface FlipState {
  from: number;
  to: number;
}

interface Props {
  layout: BookLayout;
  drawings: Drawing[];
  /** Current spread index; spread i shows drawings[i], the last spread is empty */
  spread: number;
  flip: FlipState | null;
  flipAnim: SharedValue<number>;
}

/**
 * Page curl as a cylinder roll around a vertical axis: the page peels from
 * the right edge, wraps a cylinder of radius R whose contact line `c` travels
 * leftward past the spine, and its back lies over the left page. Transparent
 * output where the page has peeled away, so the next page shows through.
 */
const CURL_SKSL = `
uniform shader page;
uniform float2 origin;
uniform float2 size;
uniform float t;

half4 main(float2 xy) {
  const float PI = 3.141592653589793;
  float pw = size.x;
  float ph = size.y;
  float u = xy.x - origin.x - pw;
  float v = xy.y - origin.y;
  float R = pw * 0.16;
  float c = pw - t * (pw + PI * R + R);
  float fade = 1.0 - smoothstep(0.86, 1.0, t);

  if (v < 0.0 || v > ph) {
    return half4(0.0);
  }

  float dx = u - c;

  // Soft shadow cast on the page underneath, just ahead of the roll
  if (dx > R && dx <= R * 2.4) {
    float k = 1.0 - (dx - R) / (R * 1.4);
    return half4(0.0, 0.0, 0.0, 0.26 * k * k) * fade;
  }

  // The roll itself: two layers wrap the cylinder; the far side is on top
  if (dx > 0.0 && dx <= R) {
    float ratio = clamp(dx / R, 0.0, 1.0);
    float a1 = asin(ratio);
    float a2 = PI - a1;
    float s2 = c + R * a2;
    if (s2 >= 0.0 && s2 <= pw) {
      half4 col = page.eval(float2(s2, v));
      float shade = 0.68 + 0.32 * ratio;
      return half4(col.rgb * shade, col.a) * fade;
    }
    float s1 = c + R * a1;
    if (s1 >= 0.0 && s1 <= pw) {
      half4 col = page.eval(float2(s1, v));
      float shade = 0.86 + 0.14 * (1.0 - ratio);
      return half4(col.rgb * shade, col.a) * fade;
    }
    return half4(0.0);
  }

  if (u <= c) {
    // Back of the page, laid over whatever is to the left of the roll
    float sBack = 2.0 * c + PI * R - u;
    if (sBack >= 0.0 && sBack <= pw && u >= -pw) {
      float edge = clamp((c - u) / (R * 1.5), 0.0, 1.0);
      float shade = 0.90 + 0.08 * edge;
      return half4(half3(0.985, 0.964, 0.925) * shade, 1.0) * fade;
    }
    // Still-flat part of the page, attached at the spine
    if (u >= 0.0 && u <= pw) {
      half4 col = page.eval(float2(u, v));
      float sh = 1.0 - 0.22 * exp(-abs(c - u) / max(R * 0.8, 1.0));
      return half4(col.rgb * sh, col.a);
    }
  }
  return half4(0.0);
}
`;

const CURL_EFFECT = Skia.RuntimeEffect.Make(CURL_SKSL);
if (!CURL_EFFECT) {
  console.warn("Bloombook: page-curl shader failed to compile, using fold fallback");
}

/** Debug helper: render the curl frozen at this progress on the settled screen. Set null to disable. */
const DEBUG_CURL_T: number | null = null;

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

export function Scrapbook({ layout, drawings, spread, flip, flipAnim }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { book, leftPage, rightPage, rightSlot, spineX } = layout;

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const underlyingIndex = flip ? (dir > 0 ? flip.to : flip.from) : spread;
  const flippingIndex = flip ? (dir > 0 ? flip.from : flip.to) : null;
  const underlyingDrawing = drawings[underlyingIndex];
  const flippingDrawing = flippingIndex !== null ? drawings[flippingIndex] : undefined;

  // Preload the current spread and both neighbors so a flip never starts
  // with an unloaded page face (flips only ever go one step)
  const imgPrev = useImage(drawings[spread - 1]?.uri ?? null);
  const imgCur = useImage(drawings[spread]?.uri ?? null);
  const imgNext = useImage(drawings[spread + 1]?.uri ?? null);
  const imageFor = (index: number) => {
    if (index === spread - 1) return imgPrev;
    if (index === spread) return imgCur;
    if (index === spread + 1) return imgNext;
    return null;
  };
  const underImage = imageFor(underlyingIndex);
  const flipImage = flippingIndex !== null ? imageFor(flippingIndex) : null;

  const debugCurl = DEBUG_CURL_T !== null && !flip;
  const snapDrawing = debugCurl ? drawings[spread] : flippingDrawing;
  const snapImage = debugCurl ? imgCur : flipImage;

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

  // Snapshot of the flipping page's face, rendered once per flip
  const pageSnapshot = useMemo(() => {
    if ((!flip && !debugCurl) || !CURL_EFFECT) return null;
    const SS = 2;
    const surface = Skia.Surface.Make(
      Math.ceil(rightPage.width * SS),
      Math.ceil(rightPage.height * SS),
    );
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(SS, SS);

    const pagePaint = Skia.Paint();
    pagePaint.setColor(Skia.Color(colors.page));
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(0, 0, rightPage.width, rightPage.height), 8, 8),
      pagePaint,
    );

    const dotPaint = Skia.Paint();
    dotPaint.setColor(Skia.Color("rgba(120,100,70,0.09)"));
    for (let y = 12; y < rightPage.height - 6; y += 17) {
      for (let x = 12; x < rightPage.width - 6; x += 17) {
        canvas.drawCircle(x, y, 0.9, dotPaint);
      }
    }

    if (snapDrawing && snapImage) {
      const slotLocal = {
        x: rightSlot.x - rightPage.x,
        y: rightSlot.y - rightPage.y,
        width: rightSlot.width,
        height: rightSlot.height,
      };
      const r = fitRect(snapDrawing.width, snapDrawing.height, slotLocal);
      canvas.save();
      canvas.rotate(snapDrawing.rotation, r.x + r.width / 2, r.y + r.height / 2);
      canvas.drawImageRect(
        snapImage,
        { x: 0, y: 0, width: snapImage.width(), height: snapImage.height() },
        { x: r.x, y: r.y, width: r.width, height: r.height },
        Skia.Paint(),
      );
      canvas.restore();
    }
    return surface.makeImageSnapshot();
  }, [flip, debugCurl, snapImage, snapDrawing, rightPage, rightSlot]);

  const curlUniforms = useDerivedValue(() => ({
    origin: [leftPage.x, rightPage.y],
    size: [rightPage.width, rightPage.height],
    t: debugCurl ? DEBUG_CURL_T! : dir > 0 ? flipAnim.value : 1 - flipAnim.value,
  }));

  // Legacy fold fallback (only used if the shader failed to compile)
  const pageScaleX = useDerivedValue(() => {
    const t = flipAnim.value;
    return dir > 0 ? 1 - 2 * t : -1 + 2 * t;
  });
  const frontOpacity = useDerivedValue(() => (pageScaleX.value > 0 ? 1 : 0));
  const backOpacity = useDerivedValue(() => (pageScaleX.value > 0 ? 0 : 1));
  const flipTransform = useDerivedValue(() => [{ scaleX: pageScaleX.value }]);

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

      {/* coral cover + stitched edge */}
      <RoundedRect x={book.x} y={book.y} width={book.width} height={book.height} r={14} color={colors.bookBorder} />
      <RoundedRect
        x={book.x + 5}
        y={book.y + 5}
        width={book.width - 10}
        height={book.height - 10}
        r={11}
        style="stroke"
        strokeWidth={1.8}
        color={colors.bookBorderDark}
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
        color={colors.page}
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

      {/* underlying right-page drawing (the one being revealed, or the current one) */}
      {underlyingDrawing ? (
        <DrawingOnPage drawing={underlyingDrawing} image={underImage} slot={rightSlot} />
      ) : null}

      {/* flipping page */}
      {(flip || debugCurl) && CURL_EFFECT && pageSnapshot ? (
        <Rect
          x={leftPage.x}
          y={rightPage.y}
          width={leftPage.width + rightPage.width}
          height={rightPage.height}
        >
          <Shader source={CURL_EFFECT} uniforms={curlUniforms}>
            <ImageShader
              image={pageSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: rightPage.width, height: rightPage.height }}
            />
          </Shader>
        </Rect>
      ) : flip ? (
        <Group transform={flipTransform} origin={{ x: spineX, y: leftPage.y + leftPage.height / 2 }}>
          <Group opacity={frontOpacity}>
            <RoundedRect
              x={rightPage.x}
              y={rightPage.y}
              width={rightPage.width}
              height={rightPage.height}
              r={pageRadius}
              color={colors.page}
            />
            {flippingDrawing ? (
              <DrawingOnPage drawing={flippingDrawing} image={flipImage} slot={rightSlot} />
            ) : null}
          </Group>
          <Group opacity={backOpacity}>
            <RoundedRect
              x={rightPage.x}
              y={rightPage.y}
              width={rightPage.width}
              height={rightPage.height}
              r={pageRadius}
              color={colors.pageEdge}
            />
          </Group>
        </Group>
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
