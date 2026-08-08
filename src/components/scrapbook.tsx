import {
  Blur,
  Canvas,
  Group,
  Image as SkiaImage,
  ImageShader,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Shader,
  Skia,
  vec,
  type SkImage,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import {
  buildFaceSnapshot,
  PAGE_FLIP_EFFECT,
  PAGE_DOT_END_INSET,
  PAGE_DOT_INSET,
  PAGE_DOT_RADIUS,
  PAGE_DOT_STEP,
  PAGE_FACE_RADIUS,
} from "@/components/curl-shader";
import {
  BindingRing,
  PadDecorationMarks,
  PadStampMark,
  PadTab,
  PageBorder,
} from "@/components/pad-ornaments";
import { getPadDesign, PAD_GEOMETRY, type PadDesignId } from "@/pad-designs";
import type { PadBorderId, PadDecorationId } from "@/pad-visuals";
import type { Drawing } from "@/store/drawings";
import { colors, padDarkColor } from "@/theme";
import { useImageCache } from "@/utils/image-cache";
import { fitRect, type BookLayout, type Rect as LayoutRect } from "@/utils/book-layout";
import { logPageFlip } from "@/utils/page-flip";

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
  flipCurl: SharedValue<number>;
  coverColor?: string;
  pageColor?: string;
  design?: PadDesignId;
  border?: PadBorderId;
  decoration?: PadDecorationId;
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

export function Scrapbook({
  layout,
  drawings,
  spread,
  flip,
  flipAnim,
  flipCurl,
  coverColor,
  pageColor,
  design,
  border = "none",
  decoration = "none",
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { book, leftPage, rightPage, leftSlot, rightSlot, spineX } = layout;
  const palette = getPadDesign(design, coverColor);
  const cover = coverColor ?? palette.cover;
  const paper = pageColor ?? palette.paper;
  const coverDark = cover === palette.cover ? palette.coverDark : padDarkColor(cover);

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const fromIdx = flip ? flip.from : spread;
  const toIdx = flip ? flip.to : spread;

  // Which drawings play which role during a flip (see design note in
  // curl-shader.ts): the turning page's front is the outgoing right page and
  // its back is the incoming left page.
  const staticLeft = drawings[2 * spread];
  const staticRight = drawings[2 * spread + 1];
  const baseLeft = flip ? (dir > 0 ? drawings[2 * fromIdx] : drawings[2 * toIdx]) : staticLeft;
  const baseRight = flip
    ? dir > 0
      ? drawings[2 * toIdx + 1]
      : drawings[2 * fromIdx + 1]
    : staticRight;
  const frontFace = flip ? (dir > 0 ? drawings[2 * fromIdx + 1] : drawings[2 * toIdx + 1]) : undefined;
  const backFace = flip ? (dir > 0 ? drawings[2 * toIdx] : drawings[2 * fromIdx]) : undefined;

  // Persistent cache: every drawing in the pad stays decoded, so flips and
  // spread changes render synchronously with no image pop-in
  const lookup = useImageCache(drawings.map((d) => d.uri));
  const imageFor = (drawing: Drawing | undefined): SkImage | null =>
    drawing ? lookup(drawing.uri) : null;

  const dotsPath = useMemo(() => {
    const p = Skia.Path.Make();
    for (
      let y = leftPage.y + PAGE_DOT_INSET;
      y < leftPage.y + leftPage.height - PAGE_DOT_END_INSET;
      y += PAGE_DOT_STEP
    ) {
      for (
        let x = leftPage.x + PAGE_DOT_INSET;
        x < rightPage.x + rightPage.width - PAGE_DOT_END_INSET;
        x += PAGE_DOT_STEP
      ) {
        p.addCircle(x, y, PAGE_DOT_RADIUS);
      }
    }
    return p;
  }, [leftPage, rightPage]);

  const spineRings = useMemo(() => {
    const out: number[] = [];
    for (let y = book.y + 30; y < book.y + book.height - 22; y += 38) out.push(y);
    return out;
  }, [book]);

  const rightSlotLocal = useMemo(
    () => ({
      x: rightSlot.x - rightPage.x,
      y: rightSlot.y - rightPage.y,
      width: rightSlot.width,
      height: rightSlot.height,
    }),
    [rightSlot, rightPage],
  );

  const leftSlotLocal = useMemo(
    () => ({
      x: leftSlot.x - leftPage.x,
      y: leftSlot.y - leftPage.y,
      width: leftSlot.width,
      height: leftSlot.height,
    }),
    [leftSlot, leftPage],
  );

  const frontImage = imageFor(frontFace);
  const backImage = imageFor(backFace);

  const frontSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const items = frontFace ? [{ drawing: frontFace, image: frontImage, slotLocal: rightSlotLocal }] : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, paper, palette.gridDot);
  }, [flip, frontFace, frontImage, paper, palette.gridDot, rightPage, rightSlotLocal]);

  const backSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const items = backFace ? [{ drawing: backFace, image: backImage, slotLocal: leftSlotLocal }] : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, paper, palette.gridDot);
  }, [flip, backFace, backImage, paper, palette.gridDot, rightPage, leftSlotLocal]);

  const baseLeftSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const image = imageFor(baseLeft);
    const items = baseLeft ? [{ drawing: baseLeft, image, slotLocal: leftSlotLocal }] : [];
    return buildFaceSnapshot(leftPage.width, leftPage.height, items, paper, palette.gridDot);
  }, [baseLeft, flip, leftPage, leftSlotLocal, lookup, paper, palette.gridDot]);

  const baseRightSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const image = imageFor(baseRight);
    const items = baseRight ? [{ drawing: baseRight, image, slotLocal: rightSlotLocal }] : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, paper, palette.gridDot);
  }, [baseRight, flip, lookup, paper, palette.gridDot, rightPage, rightSlotLocal]);

  useEffect(() => {
    if (!flip) return;
    logPageFlip("renderer-ready", {
      mode: "spread",
      from: flip.from,
      to: flip.to,
      shader: Boolean(PAGE_FLIP_EFFECT),
      front: Boolean(frontSnapshot),
      back: Boolean(backSnapshot),
      underLeft: Boolean(baseLeftSnapshot),
      underRight: Boolean(baseRightSnapshot),
    });
  }, [backSnapshot, baseLeftSnapshot, baseRightSnapshot, flip, frontSnapshot]);

  const flipUniforms = useDerivedValue(() => ({
    origin: [leftPage.x, rightPage.y],
    size: [rightPage.width, rightPage.height],
    t: dir > 0 ? flipAnim.value : 1 - flipAnim.value,
    transposed: 0,
    spineOff: rightPage.width,
    curl: flipCurl.value,
    hasLeftBase: 1,
  }));

  const bindingOverlayOpacity = useDerivedValue(() => {
    const turn = dir > 0 ? flipAnim.value : 1 - flipAnim.value;
    const endpoint = Math.abs(turn - 0.5) * 2;
    const x = Math.max(0, Math.min(1, (endpoint - 0.68) / 0.22));
    return x * x * (3 - 2 * x);
  });

  const pageRadius = PAGE_FACE_RADIUS;

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: screenW, height: screenH }]} pointerEvents="none">
      {/* Warm studio shadow. */}
      <RoundedRect
        x={book.x + 3}
        y={book.y + 10}
        width={book.width - 6}
        height={book.height - 1}
        r={PAD_GEOMETRY.shellRadius}
        color={colors.pageShadow}
      >
        <Blur blur={18} />
      </RoundedRect>

      {/* Section tabs remain inside the same visual gutter as single-page pads. */}
      <PadTab
        x={book.x - PAD_GEOMETRY.tabProtrusion}
        y={book.y + book.height * 0.61}
        width={36}
        height={58}
        color={palette.tabs[0].color}
        glyph={palette.tabs[0].glyph}
        glyphColor={palette.tabs[0].glyphColor}
        side="left"
      />
      <PadTab
        x={book.x + book.width - 22}
        y={book.y + book.height * 0.5}
        width={36}
        height={58}
        color={palette.tabs[1].color}
        glyph={palette.tabs[1].glyph}
        glyphColor={palette.tabs[1].glyphColor}
        side="right"
      />
      <PadTab
        x={book.x + book.width - 22}
        y={book.y + book.height * 0.5 + 64}
        width={36}
        height={58}
        color={palette.tabs[2].color}
        glyph={palette.tabs[2].glyph}
        glyphColor={palette.tabs[2].glyphColor}
        side="right"
      />

      {/* Smooth molded shell. */}
      <RoundedRect
        x={book.x}
        y={book.y}
        width={book.width}
        height={book.height}
        r={PAD_GEOMETRY.shellRadius}
        color={cover}
      />
      <RoundedRect
        x={book.x + 4}
        y={book.y + 4}
        width={book.width - 8}
        height={book.height - 8}
        r={PAD_GEOMETRY.shellRadius - 4}
        style="stroke"
        strokeWidth={2}
        color="rgba(255,255,255,0.30)"
      />
      <RoundedRect
        x={book.x + 1}
        y={book.y + 1}
        width={book.width - 2}
        height={book.height - 2}
        r={PAD_GEOMETRY.shellRadius - 1}
        style="stroke"
        strokeWidth={1.4}
        color={coverDark}
        opacity={0.42}
      />

      {/* Visible paper stack under the open spread. */}
      <RoundedRect
        x={leftPage.x + 2}
        y={leftPage.y + 7}
        width={rightPage.x + rightPage.width - leftPage.x - 4}
        height={leftPage.height - 4}
        r={PAGE_FACE_RADIUS}
        color={palette.pageEdge}
      />
      <RoundedRect
        x={leftPage.x + 1}
        y={leftPage.y + 3}
        width={rightPage.x + rightPage.width - leftPage.x - 2}
        height={leftPage.height - 2}
        r={PAGE_FACE_RADIUS}
        color={palette.pageStack}
      />

      {/* Cream spread with a quiet dot grid. */}
      <RoundedRect
        x={leftPage.x}
        y={leftPage.y}
        width={rightPage.x + rightPage.width - leftPage.x}
        height={leftPage.height}
        r={pageRadius}
        color={paper}
      />
      <RoundedRect
        x={leftPage.x + 2}
        y={leftPage.y + 2}
        width={rightPage.x + rightPage.width - leftPage.x - 4}
        height={leftPage.height - 4}
        r={pageRadius - 2}
        style="stroke"
        strokeWidth={1}
        color={colors.border}
      />
      <Path path={dotsPath} color={palette.gridDot} />

      {/* center crease shading */}
      <Rect x={spineX - 22} y={leftPage.y} width={44} height={leftPage.height} opacity={0.12}>
        <LinearGradient
          start={vec(spineX - 22, 0)}
          end={vec(spineX + 22, 0)}
          colors={["transparent", "rgba(40,67,90,0.5)", "transparent"]}
        />
      </Rect>

      {/* left page drawing (static through a flip until the page lands) */}
      {staticLeft ? <DrawingOnPage drawing={staticLeft} image={imageFor(staticLeft)} slot={leftSlot} /> : null}

      {/* right page drawing being revealed (or the settled one) */}
      {staticRight ? <DrawingOnPage drawing={staticRight} image={imageFor(staticRight)} slot={rightSlot} /> : null}

      <PageBorder
        id={border}
        x={leftPage.x}
        y={leftPage.y}
        width={leftPage.width}
        height={leftPage.height}
        accent={palette.stampColor}
      />
      <PageBorder
        id={border}
        x={rightPage.x}
        y={rightPage.y}
        width={rightPage.width}
        height={rightPage.height}
        accent={palette.stampColor}
      />

      {/*
       * The center binding belongs above the open spread but behind a loose
       * turning sheet. This prevents the rings from floating over the fold.
       */}
      {spineRings.map((y) => (
        <BindingRing
          key={y}
          cx={spineX}
          cy={y}
          orientation="horizontal"
          ring={palette.ring}
          ringDark={palette.ringDark}
          hole={palette.ringHole}
        />
      ))}

      {/* One soft, two-sided sheet turning around the center binding. */}
      {flip &&
      PAGE_FLIP_EFFECT &&
      frontSnapshot &&
      backSnapshot &&
      baseLeftSnapshot &&
      baseRightSnapshot ? (
        <Rect
          x={leftPage.x}
          y={rightPage.y}
          width={leftPage.width + rightPage.width}
          height={rightPage.height}
        >
          <Shader source={PAGE_FLIP_EFFECT} uniforms={flipUniforms}>
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
            <ImageShader
              image={baseLeftSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: leftPage.width, height: leftPage.height }}
            />
            <ImageShader
              image={baseRightSnapshot}
              fit="fill"
              rect={{ x: 0, y: 0, width: rightPage.width, height: rightPage.height }}
            />
          </Shader>
        </Rect>
      ) : null}

      {flip ? (
        <Group opacity={bindingOverlayOpacity}>
          {spineRings.map((y) => (
            <BindingRing
              key={`overlay-${y}`}
              cx={spineX}
              cy={y}
              orientation="horizontal"
              ring={palette.ring}
              ringDark={palette.ringDark}
              hole={palette.ringHole}
            />
          ))}
        </Group>
      ) : null}

      {decoration === "none" ? (
        <PadStampMark
          cx={leftPage.x + 27}
          cy={leftPage.y + leftPage.height - 27}
          stamp={palette.stamp}
          color={palette.stampColor}
        />
      ) : (
        <PadDecorationMarks
          id={decoration}
          x={leftPage.x}
          y={leftPage.y}
          width={rightPage.x + rightPage.width - leftPage.x}
          height={leftPage.height}
          accent={palette.stampColor}
          secondary={palette.tabs[1].color}
        />
      )}
    </Canvas>
  );
}
