import {
  Blur,
  Circle,
  Group,
  PaintStyle,
  Path,
  Rect,
  RoundedRect,
  Skia,
  type SkCanvas,
} from "@shopify/react-native-skia";
import type { ReactNode } from "react";

import { PAD_GEOMETRY, type PadStamp, type PadTabGlyph } from "@/pad-designs";
import {
  decorationSidesForPlacement,
  type PadBorderId,
  type PadDecorationId,
  type PadDecorationPlacement,
} from "@/pad-visuals";

export function PageBorder({
  id,
  x,
  y,
  width,
  height,
  accent,
}: {
  id: PadBorderId;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: string;
}) {
  if (id === "none") return null;
  const inset = 8;
  const innerX = x + inset;
  const innerY = y + inset;
  const innerWidth = width - inset * 2;
  const innerHeight = height - inset * 2;

  if (id === "gallery-mat") {
    return (
      <Group opacity={0.72}>
        <RoundedRect x={innerX} y={innerY} width={innerWidth} height={innerHeight} r={11} style="stroke" strokeWidth={7} color="#E8E2D6" />
        <RoundedRect x={innerX + 5} y={innerY + 5} width={innerWidth - 10} height={innerHeight - 10} r={8} style="stroke" strokeWidth={1.5} color={accent} />
      </Group>
    );
  }

  if (id === "polaroid") {
    return (
      <Group>
        <RoundedRect x={innerX} y={innerY} width={innerWidth} height={innerHeight} r={8} style="stroke" strokeWidth={8} color="rgba(255,255,255,0.92)" />
        <Rect x={innerX + 4} y={innerY + innerHeight - 16} width={innerWidth - 8} height={12} color="rgba(255,255,255,0.88)" />
        <RoundedRect x={innerX + 4} y={innerY + 4} width={innerWidth - 8} height={innerHeight - 8} r={6} style="stroke" strokeWidth={1} color="rgba(40,67,90,0.17)" />
      </Group>
    );
  }

  if (id === "torn-paper") {
    const path = tornBorderPath(innerX, innerY, innerWidth, innerHeight);
    return <Path path={path} style="stroke" strokeWidth={2.2} color="rgba(117,104,90,0.52)" />;
  }

  if (id === "washi-tape") {
    return (
      <Group opacity={0.58}>
        <Group transform={[{ rotate: -0.16 }]} origin={{ x: innerX + 18, y: innerY + 5 }}>
          <RoundedRect x={innerX - 2} y={innerY} width={40} height={11} r={3} color={accent} />
        </Group>
        <Group transform={[{ rotate: 0.15 }]} origin={{ x: innerX + innerWidth - 18, y: innerY + 5 }}>
          <RoundedRect x={innerX + innerWidth - 38} y={innerY} width={40} height={11} r={3} color={accent} />
        </Group>
        <Group transform={[{ rotate: 0.12 }]} origin={{ x: innerX + 18, y: innerY + innerHeight - 5 }}>
          <RoundedRect x={innerX - 2} y={innerY + innerHeight - 11} width={40} height={11} r={3} color={accent} />
        </Group>
      </Group>
    );
  }

  if (id === "scalloped") {
    const circles: ReactNode[] = [];
    for (let px = innerX + 8; px < innerX + innerWidth - 6; px += 16) {
      circles.push(<Circle key={`t-${px}`} cx={px} cy={innerY + 2} r={5.2} color={accent} opacity={0.34} />);
      circles.push(<Circle key={`b-${px}`} cx={px} cy={innerY + innerHeight - 2} r={5.2} color={accent} opacity={0.34} />);
    }
    for (let py = innerY + 18; py < innerY + innerHeight - 14; py += 16) {
      circles.push(<Circle key={`l-${py}`} cx={innerX + 2} cy={py} r={5.2} color={accent} opacity={0.34} />);
      circles.push(<Circle key={`r-${py}`} cx={innerX + innerWidth - 2} cy={py} r={5.2} color={accent} opacity={0.34} />);
    }
    return <Group>{circles}</Group>;
  }

  if (id === "crayon-edge") {
    return (
      <Group opacity={0.62}>
        <RoundedRect x={innerX} y={innerY} width={innerWidth} height={innerHeight} r={10} style="stroke" strokeWidth={3.1} color={accent} />
        <RoundedRect x={innerX + 3} y={innerY + 2} width={innerWidth - 5} height={innerHeight - 5} r={8} style="stroke" strokeWidth={1.4} color={accent} />
      </Group>
    );
  }

  if (id === "sticker-stars") {
    return (
      <Group>
        <RoundedRect x={innerX} y={innerY} width={innerWidth} height={innerHeight} r={10} style="stroke" strokeWidth={1.5} color={accent} opacity={0.34} />
        <PadStampMark cx={innerX + 12} cy={innerY + 12} stamp="spark" color={accent} />
        <PadStampMark cx={innerX + innerWidth - 12} cy={innerY + 12} stamp="spark" color={accent} />
        <PadStampMark cx={innerX + innerWidth - 12} cy={innerY + innerHeight - 12} stamp="spark" color={accent} />
      </Group>
    );
  }

  return (
    <Group>
      <RoundedRect x={innerX} y={innerY} width={innerWidth} height={innerHeight} r={8} style="stroke" strokeWidth={7} color="#C89B4B" opacity={0.78} />
      <RoundedRect x={innerX + 5} y={innerY + 5} width={innerWidth - 10} height={innerHeight - 10} r={5} style="stroke" strokeWidth={2} color="#7E5A26" opacity={0.72} />
      <RoundedRect x={innerX + 9} y={innerY + 9} width={innerWidth - 18} height={innerHeight - 18} r={4} style="stroke" strokeWidth={1} color="#E6C878" opacity={0.8} />
    </Group>
  );
}

export function PadDecorationMarks({
  id,
  x,
  y,
  width,
  height,
  accent,
  secondary,
}: {
  id: PadDecorationId;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: string;
  secondary: string;
}) {
  if (id === "none") return null;
  const left = x + 20;
  const right = x + width - 20;
  const top = y + 20;
  const bottom = y + height - 20;

  if (id === "confetti-pop") {
    return (
      <Group opacity={0.72}>
        {[
          [left, top, accent],
          [left + 11, top + 7, secondary],
          [right, top + 4, secondary],
          [right - 12, top - 3, accent],
          [right, bottom, accent],
          [left + 5, bottom, secondary],
        ].map(([cx, cy, color], index) => (
          <Circle key={index} cx={cx as number} cy={cy as number} r={index % 2 ? 3.2 : 4.2} color={color as string} />
        ))}
      </Group>
    );
  }

  if (id === "sparkle-trail") {
    return (
      <Group>
        <PadStampMark cx={left} cy={bottom} stamp="spark" color={accent} />
        <PadStampMark cx={right} cy={top} stamp="spark" color={secondary} />
        <Circle cx={right - 19} cy={top + 17} r={3} color={accent} opacity={0.58} />
      </Group>
    );
  }

  if (id === "heart-parade") {
    return (
      <Group>
        <PadStampMark cx={left} cy={bottom} stamp="heart" color={accent} />
        <PadStampMark cx={right} cy={top} stamp="heart" color={secondary} />
      </Group>
    );
  }

  if (id === "flower-garden") {
    return (
      <Group>
        <PadStampMark cx={left} cy={bottom} stamp="flower" color={accent} />
        <PadStampMark cx={right} cy={top} stamp="flower" color={secondary} />
      </Group>
    );
  }

  if (id === "starry-sky") {
    return (
      <Group>
        <PadStampMark cx={right} cy={top} stamp="spark" color={accent} />
        <Circle cx={right - 24} cy={top + 8} r={5} color={secondary} opacity={0.55} />
        <Circle cx={right - 32} cy={top + 1} r={2} color={accent} opacity={0.65} />
        <PadStampMark cx={left} cy={bottom} stamp="spark" color={secondary} />
      </Group>
    );
  }

  return (
    <Group>
      <PadStampMark cx={left} cy={bottom} stamp="heart" color={accent} />
      <PadStampMark cx={right} cy={top} stamp="spark" color={secondary} />
      <PadStampMark cx={right - 18} cy={bottom} stamp="flower" color={accent} />
    </Group>
  );
}

export interface SnapshotPageVisuals {
  border: PadBorderId;
  decoration: PadDecorationId;
  accent: string;
  secondary: string;
  stamp: PadStamp;
  /** Split a spread-wide decoration between page snapshots so the spine stays clean. */
  decorationPlacement?: PadDecorationPlacement;
}

/** Draws the same page styling into an offscreen page-turn snapshot. */
export function drawSnapshotPageVisuals(
  canvas: SkCanvas,
  width: number,
  height: number,
  visuals: SnapshotPageVisuals,
): void {
  const placement = visuals.decorationPlacement ?? "both";
  drawSnapshotBorder(canvas, visuals.border, width, height, visuals.accent);
  if (visuals.decoration === "none") {
    if (placement !== "right") {
      drawSnapshotStamp(canvas, 29, height - 29, visuals.stamp, visuals.accent);
    }
    return;
  }
  drawSnapshotDecorations(
    canvas,
    visuals.decoration,
    width,
    height,
    visuals.accent,
    visuals.secondary,
    placement,
  );
}

function snapshotPaint(
  color: string,
  style: PaintStyle = PaintStyle.Fill,
  strokeWidth = 1,
  alpha = 1,
) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(style);
  paint.setStrokeWidth(strokeWidth);
  paint.setAlphaf(alpha);
  return paint;
}

function drawSnapshotRRect(
  canvas: SkCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  style: PaintStyle = PaintStyle.Fill,
  strokeWidth = 1,
  alpha = 1,
) {
  canvas.drawRRect(
    Skia.RRectXY(Skia.XYWHRect(x, y, width, height), radius, radius),
    snapshotPaint(color, style, strokeWidth, alpha),
  );
}

function drawSnapshotBorder(
  canvas: SkCanvas,
  id: PadBorderId,
  width: number,
  height: number,
  accent: string,
) {
  if (id === "none") return;
  const x = 8;
  const y = 8;
  const innerWidth = width - 16;
  const innerHeight = height - 16;

  if (id === "gallery-mat") {
    drawSnapshotRRect(canvas, x, y, innerWidth, innerHeight, 11, "#E8E2D6", PaintStyle.Stroke, 7, 0.72);
    drawSnapshotRRect(canvas, x + 5, y + 5, innerWidth - 10, innerHeight - 10, 8, accent, PaintStyle.Stroke, 1.5, 0.72);
    return;
  }
  if (id === "polaroid") {
    drawSnapshotRRect(canvas, x, y, innerWidth, innerHeight, 8, "#FFFFFF", PaintStyle.Stroke, 8, 0.92);
    canvas.drawRect(
      Skia.XYWHRect(x + 4, y + innerHeight - 16, innerWidth - 8, 12),
      snapshotPaint("#FFFFFF", PaintStyle.Fill, 1, 0.88),
    );
    drawSnapshotRRect(canvas, x + 4, y + 4, innerWidth - 8, innerHeight - 8, 6, "#28435A", PaintStyle.Stroke, 1, 0.17);
    return;
  }
  if (id === "torn-paper") {
    canvas.drawPath(tornBorderPath(x, y, innerWidth, innerHeight), snapshotPaint("#75685A", PaintStyle.Stroke, 2.2, 0.52));
    return;
  }
  if (id === "washi-tape") {
    for (const tape of [
      { x: x - 2, y, rotation: -9, pivotX: x + 18, pivotY: y + 5 },
      { x: x + innerWidth - 38, y, rotation: 9, pivotX: x + innerWidth - 18, pivotY: y + 5 },
      { x: x - 2, y: y + innerHeight - 11, rotation: 7, pivotX: x + 18, pivotY: y + innerHeight - 5 },
    ]) {
      const saveCount = canvas.save();
      canvas.rotate(tape.rotation, tape.pivotX, tape.pivotY);
      drawSnapshotRRect(canvas, tape.x, tape.y, 40, 11, 3, accent, PaintStyle.Fill, 1, 0.58);
      canvas.restoreToCount(saveCount);
    }
    return;
  }
  if (id === "scalloped") {
    const paint = snapshotPaint(accent, PaintStyle.Fill, 1, 0.34);
    for (let px = x + 8; px < x + innerWidth - 6; px += 16) {
      canvas.drawCircle(px, y + 2, 5.2, paint);
      canvas.drawCircle(px, y + innerHeight - 2, 5.2, paint);
    }
    for (let py = y + 18; py < y + innerHeight - 14; py += 16) {
      canvas.drawCircle(x + 2, py, 5.2, paint);
      canvas.drawCircle(x + innerWidth - 2, py, 5.2, paint);
    }
    return;
  }
  if (id === "crayon-edge") {
    drawSnapshotRRect(canvas, x, y, innerWidth, innerHeight, 10, accent, PaintStyle.Stroke, 3.1, 0.62);
    drawSnapshotRRect(canvas, x + 3, y + 2, innerWidth - 5, innerHeight - 5, 8, accent, PaintStyle.Stroke, 1.4, 0.62);
    return;
  }
  if (id === "sticker-stars") {
    drawSnapshotRRect(canvas, x, y, innerWidth, innerHeight, 10, accent, PaintStyle.Stroke, 1.5, 0.34);
    drawSnapshotStamp(canvas, x + 12, y + 12, "spark", accent);
    drawSnapshotStamp(canvas, x + innerWidth - 12, y + 12, "spark", accent);
    drawSnapshotStamp(canvas, x + innerWidth - 12, y + innerHeight - 12, "spark", accent);
    return;
  }

  drawSnapshotRRect(canvas, x, y, innerWidth, innerHeight, 8, "#C89B4B", PaintStyle.Stroke, 7, 0.78);
  drawSnapshotRRect(canvas, x + 5, y + 5, innerWidth - 10, innerHeight - 10, 5, "#7E5A26", PaintStyle.Stroke, 2, 0.72);
  drawSnapshotRRect(canvas, x + 9, y + 9, innerWidth - 18, innerHeight - 18, 4, "#E6C878", PaintStyle.Stroke, 1, 0.8);
}

function drawSnapshotDecorations(
  canvas: SkCanvas,
  id: PadDecorationId,
  width: number,
  height: number,
  accent: string,
  secondary: string,
  placement: PadDecorationPlacement,
) {
  const left = 20;
  const right = width - 20;
  const top = 20;
  const bottom = height - 20;
  const { left: showLeft, right: showRight } = decorationSidesForPlacement(placement);
  if (id === "confetti-pop") {
    const dots: [number, number, string, number][] = [];
    if (showLeft) {
      dots.push(
        [left, top, accent, 4.2],
        [left + 11, top + 7, secondary, 3.2],
        [left + 5, bottom, secondary, 3.2],
      );
    }
    if (showRight) {
      dots.push(
        [right, top + 4, secondary, 4.2],
        [right - 12, top - 3, accent, 3.2],
        [right, bottom, accent, 4.2],
      );
    }
    for (const [cx, cy, color, radius] of dots) {
      canvas.drawCircle(cx, cy, radius, snapshotPaint(color, PaintStyle.Fill, 1, 0.72));
    }
    return;
  }
  if (id === "sparkle-trail") {
    if (showLeft) drawSnapshotStamp(canvas, left, bottom, "spark", accent);
    if (showRight) {
      drawSnapshotStamp(canvas, right, top, "spark", secondary);
      canvas.drawCircle(right - 19, top + 17, 3, snapshotPaint(accent, PaintStyle.Fill, 1, 0.58));
    }
    return;
  }
  if (id === "heart-parade") {
    if (showLeft) drawSnapshotStamp(canvas, left, bottom, "heart", accent);
    if (showRight) drawSnapshotStamp(canvas, right, top, "heart", secondary);
    return;
  }
  if (id === "flower-garden") {
    if (showLeft) drawSnapshotStamp(canvas, left, bottom, "flower", accent);
    if (showRight) drawSnapshotStamp(canvas, right, top, "flower", secondary);
    return;
  }
  if (id === "starry-sky") {
    if (showRight) {
      drawSnapshotStamp(canvas, right, top, "spark", accent);
      canvas.drawCircle(right - 24, top + 8, 5, snapshotPaint(secondary, PaintStyle.Fill, 1, 0.55));
      canvas.drawCircle(right - 32, top + 1, 2, snapshotPaint(accent, PaintStyle.Fill, 1, 0.65));
    }
    if (showLeft) drawSnapshotStamp(canvas, left, bottom, "spark", secondary);
    return;
  }
  if (showLeft) drawSnapshotStamp(canvas, left, bottom, "heart", accent);
  if (showRight) {
    drawSnapshotStamp(canvas, right, top, "spark", secondary);
    drawSnapshotStamp(canvas, right - 18, bottom, "flower", accent);
  }
}

function drawSnapshotStamp(
  canvas: SkCanvas,
  cx: number,
  cy: number,
  stamp: PadStamp,
  color: string,
) {
  const paint = snapshotPaint(color, PaintStyle.Fill, 1, 0.76);
  if (stamp === "flower") {
    for (const angle of [0, 72, 144, 216, 288]) {
      const radians = (angle * Math.PI) / 180;
      canvas.drawCircle(cx + Math.cos(radians) * 7, cy + Math.sin(radians) * 7, 4.1, paint);
    }
    canvas.drawCircle(cx, cy, 3, snapshotPaint("#FFFFFF", PaintStyle.Fill, 1, 0.62));
    return;
  }
  if (stamp === "heart") {
    canvas.drawPath(heartPath(cx, cy, 1.25), paint);
    return;
  }
  if (stamp === "spark") {
    drawSnapshotRRect(canvas, cx - 2.2, cy - 13, 4.4, 26, 2.2, color, PaintStyle.Fill, 1, 0.76);
    drawSnapshotRRect(canvas, cx - 13, cy - 2.2, 26, 4.4, 2.2, color, PaintStyle.Fill, 1, 0.76);
    const saveCount = canvas.save();
    canvas.rotate(45, cx, cy);
    drawSnapshotRRect(canvas, cx - 1.4, cy - 9, 2.8, 18, 1.4, color, PaintStyle.Fill, 1, 0.76);
    drawSnapshotRRect(canvas, cx - 9, cy - 1.4, 18, 2.8, 1.4, color, PaintStyle.Fill, 1, 0.76);
    canvas.restoreToCount(saveCount);
    return;
  }
  const saveCount = canvas.save();
  canvas.rotate(-14, cx, cy);
  drawSnapshotRRect(canvas, cx - 7, cy - 2, 14, 11, 6, color, PaintStyle.Fill, 1, 0.76);
  canvas.restoreToCount(saveCount);
  for (const [x, y, radius] of [
    [cx - 9, cy - 8, 3.2],
    [cx - 3, cy - 12, 3.1],
    [cx + 4, cy - 12, 3.1],
    [cx + 10, cy - 7, 3.2],
  ] as const) {
    canvas.drawCircle(x, y, radius, paint);
  }
}

export function PadTab({
  x,
  y,
  width,
  height,
  color,
  glyph,
  glyphColor,
  side,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  glyph: PadTabGlyph;
  glyphColor: string;
  side: "left" | "right";
}) {
  const visibleCenterX =
    side === "left"
      ? x + PAD_GEOMETRY.tabProtrusion / 2
      : x + width - PAD_GEOMETRY.tabProtrusion / 2;
  const centerY = y + height / 2;

  return (
    <Group>
      <RoundedRect
        x={x + 1}
        y={y + 3}
        width={width}
        height={height}
        r={PAD_GEOMETRY.tabRadius}
        color="rgba(65,62,48,0.14)"
      >
        <Blur blur={5} />
      </RoundedRect>
      <RoundedRect
        x={x}
        y={y}
        width={width}
        height={height}
        r={PAD_GEOMETRY.tabRadius}
        color={color}
      />
      <TabGlyph glyph={glyph} cx={visibleCenterX} cy={centerY} color={glyphColor} />
    </Group>
  );
}

function TabGlyph({ glyph, cx, cy, color }: { glyph: PadTabGlyph; cx: number; cy: number; color: string }) {
  if (glyph === "flower") {
    return (
      <Group opacity={0.84}>
        <Circle cx={cx} cy={cy - 4.2} r={3.4} color={color} />
        <Circle cx={cx + 4.2} cy={cy} r={3.4} color={color} />
        <Circle cx={cx} cy={cy + 4.2} r={3.4} color={color} />
        <Circle cx={cx - 4.2} cy={cy} r={3.4} color={color} />
        <Circle cx={cx} cy={cy} r={2.2} color="rgba(255,255,255,0.48)" />
      </Group>
    );
  }

  if (glyph === "leaf") {
    return (
      <Group transform={[{ rotate: -0.55 }]} origin={{ x: cx, y: cy }} opacity={0.84}>
        <RoundedRect x={cx - 6.5} y={cy - 3.8} width={13} height={7.6} r={4} color={color} />
        <RoundedRect x={cx - 0.8} y={cy - 5.5} width={1.6} height={11} r={0.8} color="rgba(255,255,255,0.36)" />
      </Group>
    );
  }

  if (glyph === "dot") {
    return (
      <Group opacity={0.84}>
        <Circle cx={cx} cy={cy} r={6.2} color={color} />
        <Circle cx={cx - 1.7} cy={cy - 1.8} r={1.7} color="rgba(255,255,255,0.38)" />
      </Group>
    );
  }

  if (glyph === "spark") {
    return (
      <Group opacity={0.84}>
        <RoundedRect x={cx - 1.5} y={cy - 7} width={3} height={14} r={1.5} color={color} />
        <RoundedRect x={cx - 7} y={cy - 1.5} width={14} height={3} r={1.5} color={color} />
      </Group>
    );
  }

  const heart = heartPath(cx, cy, 0.88);
  return <Path path={heart} color={color} opacity={0.84} />;
}

export function BindingRing({
  cx,
  cy,
  orientation,
  ring,
  ringDark,
  hole,
}: {
  cx: number;
  cy: number;
  orientation: "vertical" | "horizontal";
  ring: string;
  ringDark: string;
  hole: string;
}) {
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={7.4} color={hole} />
      {orientation === "vertical" ? (
        <>
          <RoundedRect x={cx - 5} y={cy - 20} width={11} height={31} r={5.5} color={ringDark} />
          <RoundedRect x={cx - 5.8} y={cy - 22} width={11} height={29.5} r={5.5} color={ring} />
          <RoundedRect x={cx - 3.3} y={cy - 18.5} width={2} height={20} r={1} color="rgba(255,255,255,0.30)" />
        </>
      ) : (
        <>
          <RoundedRect x={cx - 20} y={cy - 5} width={40} height={11} r={5.5} color={ringDark} />
          <RoundedRect x={cx - 19} y={cy - 5.8} width={38} height={11} r={5.5} color={ring} />
          <RoundedRect x={cx - 15} y={cy - 3.3} width={28} height={2} r={1} color="rgba(255,255,255,0.30)" />
        </>
      )}
    </Group>
  );
}

export function PadStampMark({ cx, cy, stamp, color }: { cx: number; cy: number; stamp: PadStamp; color: string }) {
  if (stamp === "flower") {
    return (
      <Group opacity={0.76}>
        {[0, 72, 144, 216, 288].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return <Circle key={angle} cx={cx + Math.cos(rad) * 7} cy={cy + Math.sin(rad) * 7} r={4.1} color={color} />;
        })}
        <Circle cx={cx} cy={cy} r={3} color="rgba(255,255,255,0.62)" />
      </Group>
    );
  }

  if (stamp === "heart") {
    return <Path path={heartPath(cx, cy, 1.25)} color={color} opacity={0.74} />;
  }

  if (stamp === "spark") {
    return (
      <Group opacity={0.76}>
        <RoundedRect x={cx - 2.2} y={cy - 13} width={4.4} height={26} r={2.2} color={color} />
        <RoundedRect x={cx - 13} y={cy - 2.2} width={26} height={4.4} r={2.2} color={color} />
        <Group transform={[{ rotate: Math.PI / 4 }]} origin={{ x: cx, y: cy }}>
          <RoundedRect x={cx - 1.4} y={cy - 9} width={2.8} height={18} r={1.4} color={color} />
          <RoundedRect x={cx - 9} y={cy - 1.4} width={18} height={2.8} r={1.4} color={color} />
        </Group>
      </Group>
    );
  }

  return (
    <Group opacity={0.76}>
      <Group transform={[{ rotate: -0.24 }]} origin={{ x: cx, y: cy }}>
        <RoundedRect x={cx - 7} y={cy - 2} width={14} height={11} r={6} color={color} />
      </Group>
      <Circle cx={cx - 9} cy={cy - 8} r={3.2} color={color} />
      <Circle cx={cx - 3} cy={cy - 12} r={3.1} color={color} />
      <Circle cx={cx + 4} cy={cy - 12} r={3.1} color={color} />
      <Circle cx={cx + 10} cy={cy - 7} r={3.2} color={color} />
    </Group>
  );
}

function tornBorderPath(x: number, y: number, width: number, height: number) {
  const path = Skia.PathBuilder.Make();
  const step = 11;
  path.moveTo(x, y);
  for (let px = x; px <= x + width; px += step) {
    path.lineTo(Math.min(px + step, x + width), y + (Math.round((px - x) / step) % 2 ? 2 : -1));
  }
  for (let py = y; py <= y + height; py += step) {
    path.lineTo(x + width + (Math.round((py - y) / step) % 2 ? 2 : -1), Math.min(py + step, y + height));
  }
  for (let px = x + width; px >= x; px -= step) {
    path.lineTo(Math.max(px - step, x), y + height + (Math.round((x + width - px) / step) % 2 ? 2 : -1));
  }
  for (let py = y + height; py >= y; py -= step) {
    path.lineTo(x + (Math.round((y + height - py) / step) % 2 ? 2 : -1), Math.max(py - step, y));
  }
  path.close();
  return path.detach();
}

function heartPath(cx: number, cy: number, scale: number) {
  const p = Skia.PathBuilder.Make();
  p.moveTo(cx, cy + 7 * scale);
  p.cubicTo(cx - 11 * scale, cy, cx - 6.5 * scale, cy - 9 * scale, cx, cy - 4 * scale);
  p.cubicTo(cx + 6.5 * scale, cy - 9 * scale, cx + 11 * scale, cy, cx, cy + 7 * scale);
  p.close();
  return p.detach();
}
