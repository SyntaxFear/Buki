import {
  Blur,
  Canvas,
  Group,
  Image as SkiaImage,
  ImageShader,
  Path,
  Rect,
  RoundedRect,
  Shader,
  Skia,
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
  type FaceItem,
} from "@/components/curl-shader";
import type { FlipState } from "@/components/scrapbook";
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
import type { PadBorderId, PadDecorationId } from "@/pad-visuals";
import type { Drawing, PadStyle } from "@/store/drawings";
import { colors, padDarkColor, PATRICK_HAND } from "@/theme";
import { centeredBindingRingPositions } from "@/utils/binding-layout";
import { fitRect, unitCapacity, type PadPageLayout } from "@/utils/book-layout";
import { useImageCache } from "@/utils/image-cache";
import { PAGE_FOLIO_EDGES } from "@/utils/page-folio";
import {
  logPageFlip,
  pageFlipImageId,
  pageFlipShaderProgress,
} from "@/utils/page-flip";

interface Props {
  style: Exclude<PadStyle, "spread">;
  layout: PadPageLayout;
  drawings: Drawing[];
  /** Current page index; page i shows drawings[i*cap .. i*cap+cap-1] */
  page: number;
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

function unitTraceLabel(
  drawings: readonly Drawing[],
  unit: number | null,
  capacity: number,
): string {
  if (unit === null) return "none";
  const labels: string[] = [];
  for (let slot = 0; slot < capacity; slot += 1) {
    const drawing = drawings[unit * capacity + slot];
    labels.push(
      drawing ? `${drawing.id}:${pageFlipImageId(drawing.uri)}` : "empty",
    );
  }
  return labels.join("|");
}

function faceTraceLabel(face: readonly FaceItem[]): string {
  return (
    face
      .map(
        ({ drawing, image }) =>
          `${drawing.id}:${pageFlipImageId(drawing.uri)}:${image ? "ready" : "pending"}`,
      )
      .join("|") || "empty"
  );
}

/**
 * Single-page pad bound at the top (vertical, grid) or the left (album).
 * Pages curl toward the binding — transposed for top bindings and straight
 * for left bindings — then pass behind the pad's page stack.
 */
export function FlipPad({
  style,
  layout,
  drawings,
  page,
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
  const { book, page: pageRect, slots, binding, spine } = layout;
  const palette = getPadDesign(design, coverColor);
  const cover = coverColor ?? palette.cover;
  const paper = pageColor ?? palette.paper;
  const coverDark =
    cover === palette.cover ? palette.coverDark : padDarkColor(cover);
  const cap = unitCapacity(style);
  const folioFont = useFont(PATRICK_HAND, PAGE_FOLIO_FONT_SIZE);

  const dir = flip ? Math.sign(flip.to - flip.from) : 1;
  const underUnit = flip ? (dir > 0 ? flip.to : flip.from) : page;
  const frontUnit = flip ? (dir > 0 ? flip.from : flip.to) : null;

  const imageUrisForUnits = useCallback(
    (units: ReadonlySet<number>) => {
      const uris: string[] = [];
      for (const unit of units) {
        if (unit < 0) continue;
        for (let slot = 0; slot < cap; slot += 1) {
          const drawing = drawings[unit * cap + slot];
          if (drawing) uris.push(drawing.uri);
        }
      }
      return uris;
    },
    [cap, drawings],
  );
  const watchedUris = useMemo(() => {
    const units = new Set([page, underUnit]);
    if (frontUnit !== null) units.add(frontUnit);
    return imageUrisForUnits(units);
  }, [frontUnit, imageUrisForUnits, page, underUnit]);
  const preloadUris = useMemo(() => {
    const units = new Set([page - 1, page, page + 1, underUnit]);
    if (frontUnit !== null) units.add(frontUnit);
    return imageUrisForUnits(units);
  }, [frontUnit, imageUrisForUnits, page, underUnit]);
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
  const frontFace = useMemo(() => {
    const items: FaceItem[] = [];
    if (frontUnit !== null) {
      slots.forEach((_, index) => {
        const drawing = drawings[frontUnit * cap + index];
        if (drawing) {
          items.push({
            drawing,
            image: imageFor(drawing),
            slotLocal: slotsLocal[index],
          });
        }
      });
    }
    return { cacheRevision: imageCacheRevision, items };
  }, [
    cap,
    drawings,
    frontUnit,
    imageCacheRevision,
    imageFor,
    slots,
    slotsLocal,
  ]);
  const underFace = useMemo(() => {
    const items: FaceItem[] = [];
    slots.forEach((_, index) => {
      const drawing = drawings[underUnit * cap + index];
      if (drawing) {
        items.push({
          drawing,
          image: imageFor(drawing),
          slotLocal: slotsLocal[index],
        });
      }
    });
    return { cacheRevision: imageCacheRevision, items };
  }, [
    cap,
    drawings,
    imageCacheRevision,
    imageFor,
    slots,
    slotsLocal,
    underUnit,
  ]);
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

  const frontSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT || frontUnit === null) return null;
    return buildFaceSnapshot(pageRect.width, pageRect.height, frontFace.items, {
      pageColor: paper,
      dotColor: palette.gridDot,
      guideRects: cap > 1 ? slotsLocal : [],
      guideColor: palette.slotBorder,
      visuals: snapshotVisuals,
      folio: {
        number: frontUnit + 1,
        edge: PAGE_FOLIO_EDGES.single,
        color: palette.stampColor,
        font: folioFont,
      },
    });
  }, [
    cap,
    flip,
    frontFace,
    frontUnit,
    folioFont,
    pageRect,
    palette.gridDot,
    palette.slotBorder,
    palette.stampColor,
    paper,
    snapshotVisuals,
    slotsLocal,
  ]);

  const backSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    return buildFaceSnapshot(pageRect.width, pageRect.height, [], {
      pageColor: paper,
      dotColor: palette.gridDot,
      guideRects: cap > 1 ? slotsLocal : [],
      guideColor: palette.slotBorder,
      visuals: snapshotVisuals,
    });
  }, [
    cap,
    flip,
    pageRect.height,
    pageRect.width,
    palette.gridDot,
    palette.slotBorder,
    paper,
    snapshotVisuals,
    slotsLocal,
  ]);

  const underSnapshot = useMemo(() => {
    if (!flip || !PAGE_FLIP_EFFECT) return null;
    return buildFaceSnapshot(pageRect.width, pageRect.height, underFace.items, {
      pageColor: paper,
      dotColor: palette.gridDot,
      guideRects: cap > 1 ? slotsLocal : [],
      guideColor: palette.slotBorder,
      visuals: snapshotVisuals,
      folio: {
        number: underUnit + 1,
        edge: PAGE_FOLIO_EDGES.single,
        color: palette.stampColor,
        font: folioFont,
      },
    });
  }, [
    cap,
    flip,
    folioFont,
    pageRect,
    palette.gridDot,
    palette.slotBorder,
    palette.stampColor,
    paper,
    snapshotVisuals,
    slotsLocal,
    underFace,
    underUnit,
  ]);

  useEffect(() => {
    logPageFlip("renderer-cache-state", {
      turnId: flip?.id,
      source: flip?.source,
      mode: style,
      unit: page,
      from: flip?.from,
      to: flip?.to,
      cacheRevision: imageCacheRevision,
      imagesReady: readyImageCount,
      imagesWatched: watchedImageCount,
      isLastUnit: page === Math.floor(drawings.length / cap),
      settledUnit: unitTraceLabel(drawings, page, cap),
      frontUnit,
      frontImages: faceTraceLabel(frontFace.items),
      underUnit,
      underImages: faceTraceLabel(underFace.items),
    });
  }, [
    cap,
    drawings,
    flip,
    frontFace,
    frontUnit,
    imageCacheRevision,
    page,
    readyImageCount,
    style,
    underFace,
    underUnit,
    watchedImageCount,
  ]);

  useEffect(() => {
    if (!flip) return;
    logPageFlip("renderer-ready", {
      turnId: flip.id,
      source: flip.source,
      mode: style,
      from: flip.from,
      to: flip.to,
      shader: Boolean(PAGE_FLIP_EFFECT),
      front: Boolean(frontSnapshot),
      back: Boolean(backSnapshot),
      under: Boolean(underSnapshot),
      cacheRevision: imageCacheRevision,
      imagesReady: readyImageCount,
      imagesWatched: watchedImageCount,
      frontUnit,
      frontImages: faceTraceLabel(frontFace.items),
      underUnit,
      underImages: faceTraceLabel(underFace.items),
    });
  }, [
    backSnapshot,
    flip,
    frontFace,
    frontSnapshot,
    frontUnit,
    imageCacheRevision,
    readyImageCount,
    style,
    underFace,
    underSnapshot,
    underUnit,
    watchedImageCount,
  ]);

  const flipUniforms = useDerivedValue(() => ({
    origin: binding === "top" ? [pageRect.x, spine] : [spine, pageRect.y],
    size:
      binding === "top"
        ? [pageRect.height, pageRect.width]
        : [pageRect.width, pageRect.height],
    t: pageFlipShaderProgress(flipAnim.value, flipDirection.value),
    transposed: binding === "top" ? 1 : 0,
    spineOff: 0,
    curl: flipCurl.value,
    hasLeftBase: 0,
    foldOnly: 0,
  }));

  const foldOcclusionUniforms = useDerivedValue(() => ({
    origin: binding === "top" ? [pageRect.x, spine] : [spine, pageRect.y],
    size:
      binding === "top"
        ? [pageRect.height, pageRect.width]
        : [pageRect.width, pageRect.height],
    t: pageFlipShaderProgress(flipAnim.value, flipDirection.value),
    transposed: binding === "top" ? 1 : 0,
    spineOff: 0,
    curl: flipCurl.value,
    hasLeftBase: 0,
    foldOnly: 1,
  }));

  const dotsPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    for (
      let y = pageRect.y + PAGE_DOT_INSET;
      y < pageRect.y + pageRect.height - PAGE_DOT_END_INSET;
      y += PAGE_DOT_STEP
    ) {
      for (
        let x = pageRect.x + PAGE_DOT_INSET;
        x < pageRect.x + pageRect.width - PAGE_DOT_END_INSET;
        x += PAGE_DOT_STEP
      ) {
        builder.addCircle(x, y, PAGE_DOT_RADIUS);
      }
    }
    return builder.detach();
  }, [pageRect]);

  const rings = useMemo(() => {
    if (binding === "top") {
      return centeredBindingRingPositions(
        pageRect.x,
        pageRect.width,
        23,
        14,
      ).map((x) => ({ x, y: spine + 2 }));
    }

    return centeredBindingRingPositions(
      pageRect.y,
      pageRect.height,
      23,
      14,
    ).map((y) => ({ x: spine + 2, y }));
  }, [binding, pageRect, spine]);

  // Keep the animated sheet inside the physical shell. A free overhang here
  // can escape into the header and make the title trail or bloom appear above
  // the paper because they belong to a separate Skia surface.
  const flipBounds =
    binding === "top"
      ? {
          x: pageRect.x,
          y: book.y,
          width: pageRect.width,
          height: pageRect.y + pageRect.height - book.y,
        }
      : {
          x: book.x,
          y: pageRect.y,
          width: pageRect.x + pageRect.width - book.x,
          height: pageRect.height,
        };
  const bindingOcclusionClip = useMemo(
    () =>
      binding === "top"
        ? Skia.XYWHRect(pageRect.x, book.y, pageRect.width, spine + 14 - book.y)
        : Skia.XYWHRect(
            book.x,
            pageRect.y,
            spine + 24 - book.x,
            pageRect.height,
          ),
    [binding, book.x, book.y, pageRect, spine],
  );
  const underItems = unitDrawings(underUnit);

  return (
    <Canvas
      style={[StyleSheet.absoluteFill, { width: screenW, height: screenH }]}
      pointerEvents="none"
    >
      {/* One broad shadow keeps every variant soft without muddying its edge. */}
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

      {/* Tabs stay inside a guaranteed visual gutter on narrow phones. */}
      <PadTab
        x={book.x - PAD_GEOMETRY.tabProtrusion}
        y={book.y + book.height * 0.63}
        width={PAD_GEOMETRY.tabWidth}
        height={68}
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
        y={book.y + book.height * 0.56}
        width={PAD_GEOMETRY.tabWidth}
        height={64}
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
        y={book.y + book.height * 0.56 + 70}
        width={PAD_GEOMETRY.tabWidth}
        height={64}
        color={palette.tabs[2].color}
        glyph={palette.tabs[2].glyph}
        glyphColor={palette.tabs[2].glyphColor}
        side="right"
      />

      {/* A consistent 24pt shell curve removes the previous hard corners. */}
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

      {/* A few offset sheets make the object feel like a real sketchpad. */}
      <RoundedRect
        x={pageRect.x + 2}
        y={pageRect.y + 7}
        width={pageRect.width - 4}
        height={pageRect.height - 4}
        r={PAGE_FACE_RADIUS}
        color={palette.pageEdge}
      />
      <RoundedRect
        x={pageRect.x + 1}
        y={pageRect.y + 3}
        width={pageRect.width - 2}
        height={pageRect.height - 2}
        r={PAGE_FACE_RADIUS}
        color={palette.pageStack}
      />

      {/* Warm paper, quiet dot grid, and optional layout guides. */}
      <RoundedRect
        x={pageRect.x}
        y={pageRect.y}
        width={pageRect.width}
        height={pageRect.height}
        r={PAGE_FACE_RADIUS}
        color={paper}
      />
      <RoundedRect
        x={pageRect.x + 2}
        y={pageRect.y + 2}
        width={pageRect.width - 4}
        height={pageRect.height - 4}
        r={PAGE_FACE_RADIUS - 2}
        style="stroke"
        strokeWidth={1}
        color={colors.border}
      />
      <Path path={dotsPath} color={palette.gridDot} />

      {cap > 1
        ? slots.map((slot, index) => (
            <RoundedRect
              key={`slot-${index}`}
              x={slot.x}
              y={slot.y}
              width={slot.width}
              height={slot.height}
              r={PAD_GEOMETRY.slotRadius}
              style="stroke"
              strokeWidth={1.25}
              color={palette.slotBorder}
            />
          ))
        : null}

      {/* underlying drawings (revealed by the flip, or the settled unit) */}
      {underItems.map((d) => {
        const slotIdx = drawings.indexOf(d) % cap;
        const image = imageFor(d);
        return (
          <SlotDrawing
            key={`${d.id}-${image ? "ready" : "pending"}`}
            drawing={d}
            image={image}
            slot={slots[slotIdx]}
          />
        );
      })}

      <PageBorder
        id={border}
        x={pageRect.x}
        y={pageRect.y}
        width={pageRect.width}
        height={pageRect.height}
        accent={palette.stampColor}
      />

      <PageFolio
        number={underUnit + 1}
        frame={pageRect}
        edge={PAGE_FOLIO_EDGES.single}
        color={palette.stampColor}
        font={folioFont}
      />

      {/*
       * The binding sits above the stationary page but below the loose sheet.
       * Drawing it before the flip shader lets the turning paper naturally
       * cover the rings instead of making the hardware float above the page.
       */}
      {rings.map((r, i) => (
        <BindingRing
          key={i}
          cx={r.x}
          cy={r.y}
          orientation={binding === "top" ? "vertical" : "horizontal"}
          ring={palette.ring}
          ringDark={palette.ringDark}
          hole={palette.ringHole}
        />
      ))}

      {/* One soft, two-sided sheet turns around the selected free corner. */}
      {flip &&
      PAGE_FLIP_EFFECT &&
      frontSnapshot &&
      backSnapshot &&
      underSnapshot ? (
        <Rect
          x={flipBounds.x}
          y={flipBounds.y}
          width={flipBounds.width}
          height={flipBounds.height}
        >
          <Shader source={PAGE_FLIP_EFFECT} uniforms={flipUniforms}>
            <ImageShader
              image={frontSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: pageRect.width,
                height: pageRect.height,
              }}
            />
            <ImageShader
              image={backSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: pageRect.width,
                height: pageRect.height,
              }}
            />
            <ImageShader
              image={underSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: pageRect.width,
                height: pageRect.height,
              }}
            />
            <ImageShader
              image={underSnapshot}
              fit="fill"
              rect={{
                x: 0,
                y: 0,
                width: pageRect.width,
                height: pageRect.height,
              }}
            />
          </Shader>
        </Rect>
      ) : null}

      {flip ? (
        <Group>
          {rings.map((r, i) => (
            <BindingRing
              key={`overlay-${i}`}
              cx={r.x}
              cy={r.y}
              orientation={binding === "top" ? "vertical" : "horizontal"}
              ring={palette.ring}
              ringDark={palette.ringDark}
              hole={palette.ringHole}
            />
          ))}
        </Group>
      ) : null}

      {/*
       * Keep the binding above settled paper, then repaint only the folded
       * sheet inside the hardware band. The page now hides each ring only at
       * the exact moment its diagonal fold crosses that ring.
       */}
      {flip &&
      PAGE_FLIP_EFFECT &&
      frontSnapshot &&
      backSnapshot &&
      underSnapshot ? (
        <Group clip={bindingOcclusionClip}>
          <Rect
            x={flipBounds.x}
            y={flipBounds.y}
            width={flipBounds.width}
            height={flipBounds.height}
          >
            <Shader source={PAGE_FLIP_EFFECT} uniforms={foldOcclusionUniforms}>
              <ImageShader
                image={frontSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: pageRect.width,
                  height: pageRect.height,
                }}
              />
              <ImageShader
                image={backSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: pageRect.width,
                  height: pageRect.height,
                }}
              />
              <ImageShader
                image={underSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: pageRect.width,
                  height: pageRect.height,
                }}
              />
              <ImageShader
                image={underSnapshot}
                fit="fill"
                rect={{
                  x: 0,
                  y: 0,
                  width: pageRect.width,
                  height: pageRect.height,
                }}
              />
            </Shader>
          </Rect>
        </Group>
      ) : null}

      {!flip && decoration === "none" ? (
        <PadStampMark
          cx={pageRect.x + 29}
          cy={pageRect.y + pageRect.height - 29}
          stamp={palette.stamp}
          color={palette.stampColor}
        />
      ) : !flip ? (
        <PadDecorationMarks
          id={decoration}
          x={pageRect.x}
          y={pageRect.y}
          width={pageRect.width}
          height={pageRect.height}
          accent={palette.stampColor}
          secondary={palette.tabs[1].color}
        />
      ) : null}
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
