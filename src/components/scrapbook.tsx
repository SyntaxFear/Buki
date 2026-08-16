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
  useFont,
} from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo } from "react";
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
import {
  PAGE_FOLIO_FONT_SIZE,
  PageFolio,
} from "@/components/sketchpad-page-numbers";
import { getPadDesign, PAD_GEOMETRY, type PadDesignId } from "@/pad-designs";
import {
  SPREAD_SNAPSHOT_DECORATION_PLACEMENT,
  type PadBorderId,
  type PadDecorationId,
} from "@/pad-visuals";
import type { Drawing } from "@/store/drawings";
import { colors, padDarkColor, PATRICK_HAND } from "@/theme";
import { centeredBindingRingPositions } from "@/utils/binding-layout";
import { useImageCache } from "@/utils/image-cache";
import { PAGE_FOLIO_EDGES } from "@/utils/page-folio";
import {
  fitRect,
  type BookLayout,
  type Rect as LayoutRect,
} from "@/utils/book-layout";
import {
  logPageFlip,
  pageFlipImageId,
  pageFlipShaderProgress,
} from "@/utils/page-flip";

export interface FlipState {
  id: number;
  source: "pagination" | "gesture";
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
  flipDirection: SharedValue<number>;
  flipCurl: SharedValue<number>;
  coverColor?: string;
  pageColor?: string;
  design?: PadDesignId;
  border?: PadBorderId;
  decoration?: PadDecorationId;
}

function drawingTraceLabel(drawing: Drawing | undefined): string {
  return drawing ? `${drawing.id}:${pageFlipImageId(drawing.uri)}` : "empty";
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
    <Group
      transform={[{ rotate: (drawing.rotation * Math.PI) / 180 }]}
      origin={{ x: cx, y: cy }}
    >
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
  flipDirection,
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
  const coverDark =
    cover === palette.cover ? palette.coverDark : padDarkColor(cover);
  const folioFont = useFont(PATRICK_HAND, PAGE_FOLIO_FONT_SIZE);

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const fromIdx = flip ? flip.from : spread;
  const toIdx = flip ? flip.to : spread;

  // Which drawings play which role during a flip (see design note in
  // curl-shader.ts): the turning page's front is the outgoing right page and
  // its back is the incoming left page.
  const staticLeft = drawings[2 * spread];
  const staticRight = drawings[2 * spread + 1];
  const baseLeft = flip
    ? dir > 0
      ? drawings[2 * fromIdx]
      : drawings[2 * toIdx]
    : staticLeft;
  const baseRight = flip
    ? dir > 0
      ? drawings[2 * toIdx + 1]
      : drawings[2 * fromIdx + 1]
    : staticRight;
  const frontFace = flip
    ? dir > 0
      ? drawings[2 * fromIdx + 1]
      : drawings[2 * toIdx + 1]
    : undefined;
  const backFace = flip
    ? dir > 0
      ? drawings[2 * toIdx]
      : drawings[2 * fromIdx]
    : undefined;

  const imageUrisForUnits = useCallback(
    (units: ReadonlySet<number>) => {
      const uris: string[] = [];
      for (const unit of units) {
        if (unit < 0) continue;
        const left = drawings[unit * 2];
        const right = drawings[unit * 2 + 1];
        if (left) uris.push(left.uri);
        if (right) uris.push(right.uri);
      }
      return uris;
    },
    [drawings],
  );
  const watchedUris = useMemo(
    () => imageUrisForUnits(new Set([spread, fromIdx, toIdx])),
    [fromIdx, imageUrisForUnits, spread, toIdx],
  );
  const preloadUris = useMemo(
    () =>
      imageUrisForUnits(
        new Set([spread - 1, spread, spread + 1, fromIdx, toIdx]),
      ),
    [fromIdx, imageUrisForUnits, spread, toIdx],
  );
  const {
    lookup,
    revision: imageCacheRevision,
    readyCount: readyImageCount,
    watchedCount: watchedImageCount,
  } = useImageCache(watchedUris, preloadUris);
  const imageFor = useCallback(
    (drawing: Drawing | undefined): SkImage | null =>
      drawing ? lookup(drawing.uri) : null,
    [lookup],
  );
  const staticLeftImage = imageFor(staticLeft);
  const staticRightImage = imageFor(staticRight);

  const dotsPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
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
        builder.addCircle(x, y, PAGE_DOT_RADIUS);
      }
    }
    return builder.detach();
  }, [leftPage, rightPage]);

  const spineRings = useMemo(() => {
    return centeredBindingRingPositions(book.y, book.height, 30, 22);
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
  const baseLeftImage = imageFor(baseLeft);
  const baseRightImage = imageFor(baseRight);
  const snapshotVisuals = useMemo(
    () => ({
      border,
      decoration,
      accent: palette.stampColor,
      secondary: palette.tabs[1].color,
      stamp: palette.stamp,
    }),
    [border, decoration, palette.stamp, palette.stampColor, palette.tabs],
  );
  // Settled decorations span the spread once. During a turn, partition that
  // same pattern between the left and right page faces instead of duplicating it.
  const spreadSnapshotVisuals = useMemo(
    () => ({
      turningFront: {
        ...snapshotVisuals,
        decorationPlacement: SPREAD_SNAPSHOT_DECORATION_PLACEMENT.turningFront,
      },
      turningBack: {
        ...snapshotVisuals,
        decorationPlacement: SPREAD_SNAPSHOT_DECORATION_PLACEMENT.turningBack,
      },
      baseLeft: {
        ...snapshotVisuals,
        decorationPlacement: SPREAD_SNAPSHOT_DECORATION_PLACEMENT.baseLeft,
      },
      baseRight: {
        ...snapshotVisuals,
        decorationPlacement: SPREAD_SNAPSHOT_DECORATION_PLACEMENT.baseRight,
      },
    }),
    [snapshotVisuals],
  );
  const {
    turningFront: turningFrontVisuals,
    turningBack: turningBackVisuals,
    baseLeft: baseLeftVisuals,
    baseRight: baseRightVisuals,
  } = spreadSnapshotVisuals;

  const frontSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const items = frontFace
      ? [{ drawing: frontFace, image: frontImage, slotLocal: rightSlotLocal }]
      : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, {
      pageColor: paper,
      dotColor: palette.gridDot,
      visuals: turningFrontVisuals,
      folio: {
        number: (dir > 0 ? fromIdx : toIdx) * 2 + 2,
        edge: PAGE_FOLIO_EDGES.spreadRight,
        color: palette.stampColor,
        font: folioFont,
      },
    });
  }, [
    dir,
    flip,
    folioFont,
    frontFace,
    frontImage,
    fromIdx,
    paper,
    palette.gridDot,
    palette.stampColor,
    rightPage,
    rightSlotLocal,
    toIdx,
    turningFrontVisuals,
  ]);

  const backSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const items = backFace
      ? [{ drawing: backFace, image: backImage, slotLocal: leftSlotLocal }]
      : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, {
      pageColor: paper,
      dotColor: palette.gridDot,
      visuals: turningBackVisuals,
      folio: {
        number: (dir > 0 ? toIdx : fromIdx) * 2 + 1,
        edge: PAGE_FOLIO_EDGES.spreadLeft,
        color: palette.stampColor,
        font: folioFont,
      },
    });
  }, [
    dir,
    flip,
    folioFont,
    backFace,
    backImage,
    fromIdx,
    paper,
    palette.gridDot,
    palette.stampColor,
    rightPage,
    leftSlotLocal,
    toIdx,
    turningBackVisuals,
  ]);

  const baseLeftSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const items = baseLeft
      ? [{ drawing: baseLeft, image: baseLeftImage, slotLocal: leftSlotLocal }]
      : [];
    return buildFaceSnapshot(leftPage.width, leftPage.height, items, {
      pageColor: paper,
      dotColor: palette.gridDot,
      visuals: baseLeftVisuals,
      folio: {
        number: (dir > 0 ? fromIdx : toIdx) * 2 + 1,
        edge: PAGE_FOLIO_EDGES.spreadLeft,
        color: palette.stampColor,
        font: folioFont,
      },
    });
  }, [
    baseLeft,
    baseLeftImage,
    dir,
    flip,
    folioFont,
    fromIdx,
    leftPage,
    leftSlotLocal,
    paper,
    palette.gridDot,
    palette.stampColor,
    baseLeftVisuals,
    toIdx,
  ]);

  const baseRightSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    const items = baseRight
      ? [
          {
            drawing: baseRight,
            image: baseRightImage,
            slotLocal: rightSlotLocal,
          },
        ]
      : [];
    return buildFaceSnapshot(rightPage.width, rightPage.height, items, {
      pageColor: paper,
      dotColor: palette.gridDot,
      visuals: baseRightVisuals,
      folio: {
        number: (dir > 0 ? toIdx : fromIdx) * 2 + 2,
        edge: PAGE_FOLIO_EDGES.spreadRight,
        color: palette.stampColor,
        font: folioFont,
      },
    });
  }, [
    baseRight,
    baseRightImage,
    dir,
    flip,
    folioFont,
    fromIdx,
    paper,
    palette.gridDot,
    palette.stampColor,
    rightPage,
    rightSlotLocal,
    baseRightVisuals,
    toIdx,
  ]);

  useEffect(() => {
    logPageFlip("renderer-cache-state", {
      turnId: flip?.id,
      source: flip?.source,
      mode: "spread",
      unit: spread,
      from: flip?.from,
      to: flip?.to,
      cacheRevision: imageCacheRevision,
      imagesReady: readyImageCount,
      imagesWatched: watchedImageCount,
      isLastUnit: spread === Math.floor(drawings.length / 2),
      settledLeft: drawingTraceLabel(staticLeft),
      settledRight: drawingTraceLabel(staticRight),
      settledLeftReady: Boolean(staticLeftImage),
      settledRightReady: Boolean(staticRightImage),
      frontFace: drawingTraceLabel(frontFace),
      backFace: drawingTraceLabel(backFace),
      baseLeft: drawingTraceLabel(baseLeft),
      baseRight: drawingTraceLabel(baseRight),
      frontReady: Boolean(frontImage),
      backReady: Boolean(backImage),
      baseLeftReady: Boolean(baseLeftImage),
      baseRightReady: Boolean(baseRightImage),
    });
  }, [
    backFace,
    backImage,
    baseLeft,
    baseLeftImage,
    baseRight,
    baseRightImage,
    drawings.length,
    flip,
    frontFace,
    frontImage,
    imageCacheRevision,
    readyImageCount,
    spread,
    staticLeft,
    staticLeftImage,
    staticRight,
    staticRightImage,
    watchedImageCount,
  ]);

  useEffect(() => {
    if (!flip) return;
    logPageFlip("renderer-ready", {
      turnId: flip.id,
      source: flip.source,
      mode: "spread",
      from: flip.from,
      to: flip.to,
      shader: Boolean(PAGE_FLIP_EFFECT),
      front: Boolean(frontSnapshot),
      back: Boolean(backSnapshot),
      underLeft: Boolean(baseLeftSnapshot),
      underRight: Boolean(baseRightSnapshot),
      cacheRevision: imageCacheRevision,
      imagesReady: readyImageCount,
      imagesWatched: watchedImageCount,
      frontFace: drawingTraceLabel(frontFace),
      backFace: drawingTraceLabel(backFace),
      baseLeft: drawingTraceLabel(baseLeft),
      baseRight: drawingTraceLabel(baseRight),
    });
  }, [
    backFace,
    backSnapshot,
    baseLeft,
    baseLeftSnapshot,
    baseRight,
    baseRightSnapshot,
    flip,
    frontFace,
    frontSnapshot,
    imageCacheRevision,
    readyImageCount,
    watchedImageCount,
  ]);

  const flipUniforms = useDerivedValue(() => ({
    origin: [leftPage.x, rightPage.y],
    size: [rightPage.width, rightPage.height],
    t: pageFlipShaderProgress(flipAnim.value, flipDirection.value),
    transposed: 0,
    spineOff: rightPage.width,
    curl: flipCurl.value,
    hasLeftBase: 1,
    foldOnly: 0,
  }));

  const foldOcclusionUniforms = useDerivedValue(() => ({
    origin: [leftPage.x, rightPage.y],
    size: [rightPage.width, rightPage.height],
    t: pageFlipShaderProgress(flipAnim.value, flipDirection.value),
    transposed: 0,
    spineOff: rightPage.width,
    curl: flipCurl.value,
    hasLeftBase: 1,
    foldOnly: 1,
  }));

  const bindingOcclusionClip = useMemo(
    () => Skia.XYWHRect(spineX - 22, leftPage.y, 44, leftPage.height),
    [leftPage.height, leftPage.y, spineX],
  );

  const pageRadius = PAGE_FACE_RADIUS;

  return (
    <Canvas
      style={[StyleSheet.absoluteFill, { width: screenW, height: screenH }]}
      pointerEvents="none"
    >
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
        width={PAD_GEOMETRY.tabWidth}
        height={58}
        color={palette.tabs[0].color}
        glyph={palette.tabs[0].glyph}
        glyphColor={palette.tabs[0].glyphColor}
        side="left"
      />
      <PadTab
        x={
          book.x +
          book.width -
          (PAD_GEOMETRY.tabWidth - PAD_GEOMETRY.tabProtrusion)
        }
        y={book.y + book.height * 0.5}
        width={PAD_GEOMETRY.tabWidth}
        height={58}
        color={palette.tabs[1].color}
        glyph={palette.tabs[1].glyph}
        glyphColor={palette.tabs[1].glyphColor}
        side="right"
      />
      <PadTab
        x={
          book.x +
          book.width -
          (PAD_GEOMETRY.tabWidth - PAD_GEOMETRY.tabProtrusion)
        }
        y={book.y + book.height * 0.5 + 64}
        width={PAD_GEOMETRY.tabWidth}
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
      <Rect
        x={spineX - 22}
        y={leftPage.y}
        width={44}
        height={leftPage.height}
        opacity={0.12}
      >
        <LinearGradient
          start={vec(spineX - 22, 0)}
          end={vec(spineX + 22, 0)}
          colors={["transparent", "rgba(40,67,90,0.5)", "transparent"]}
        />
      </Rect>

      {/* left page drawing (static through a flip until the page lands) */}
      {staticLeft ? (
        <DrawingOnPage
          key={`${staticLeft.id}-${staticLeftImage ? "ready" : "pending"}`}
          drawing={staticLeft}
          image={staticLeftImage}
          slot={leftSlot}
        />
      ) : null}

      {/* right page drawing being revealed (or the settled one) */}
      {staticRight ? (
        <DrawingOnPage
          key={`${staticRight.id}-${staticRightImage ? "ready" : "pending"}`}
          drawing={staticRight}
          image={staticRightImage}
          slot={rightSlot}
        />
      ) : null}

      <PageBorder
        id={border}
        x={leftPage.x}
        y={leftPage.y}
        width={leftPage.width}
        height={leftPage.height}
        accent={palette.stampColor}
      />

      <PageFolio
        number={spread * 2 + 1}
        frame={leftPage}
        edge={PAGE_FOLIO_EDGES.spreadLeft}
        color={palette.stampColor}
        font={folioFont}
      />
      <PageFolio
        number={spread * 2 + 2}
        frame={rightPage}
        edge={PAGE_FOLIO_EDGES.spreadRight}
        color={palette.stampColor}
        font={folioFont}
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
              rect={{
                x: 0,
                y: 0,
                width: rightPage.width,
                height: rightPage.height,
              }}
            />
            <ImageShader
              image={backSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: rightPage.width,
                height: rightPage.height,
              }}
            />
            <ImageShader
              image={baseLeftSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: leftPage.width,
                height: leftPage.height,
              }}
            />
            <ImageShader
              image={baseRightSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: rightPage.width,
                height: rightPage.height,
              }}
            />
          </Shader>
        </Rect>
      ) : null}

      {flip ? (
        <Group>
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

      {/*
       * Rings sit above settled paper. Repaint only the loose folded portion
       * over the narrow spine band so each connector disappears solely while
       * the diagonal sheet is physically crossing it.
       */}
      {flip &&
      PAGE_FLIP_EFFECT &&
      frontSnapshot &&
      backSnapshot &&
      baseLeftSnapshot &&
      baseRightSnapshot ? (
        <Group clip={bindingOcclusionClip}>
          <Rect
            x={leftPage.x}
            y={rightPage.y}
            width={leftPage.width + rightPage.width}
            height={rightPage.height}
          >
            <Shader source={PAGE_FLIP_EFFECT} uniforms={foldOcclusionUniforms}>
              <ImageShader
                image={frontSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: rightPage.width,
                  height: rightPage.height,
                }}
              />
              <ImageShader
                image={backSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: rightPage.width,
                  height: rightPage.height,
                }}
              />
              <ImageShader
                image={baseLeftSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: leftPage.width,
                  height: leftPage.height,
                }}
              />
              <ImageShader
                image={baseRightSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: rightPage.width,
                  height: rightPage.height,
                }}
              />
            </Shader>
          </Rect>
        </Group>
      ) : null}

      {!flip && decoration === "none" ? (
        <PadStampMark
          cx={leftPage.x + 27}
          cy={leftPage.y + leftPage.height - 27}
          stamp={palette.stamp}
          color={palette.stampColor}
        />
      ) : !flip ? (
        <PadDecorationMarks
          id={decoration}
          x={leftPage.x}
          y={leftPage.y}
          width={rightPage.x + rightPage.width - leftPage.x}
          height={leftPage.height}
          accent={palette.stampColor}
          secondary={palette.tabs[1].color}
        />
      ) : null}
    </Canvas>
  );
}
