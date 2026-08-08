import {
  Blur,
  Circle,
  Group,
  Path,
  Rect,
  RoundedRect,
  Skia,
} from "@shopify/react-native-skia";
import type { ReactNode } from "react";

import { PAD_GEOMETRY, type PadStamp, type PadTabGlyph } from "@/pad-designs";
import type { PadBorderId, PadDecorationId } from "@/pad-visuals";

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
  const path = Skia.Path.Make();
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
  return path;
}

function heartPath(cx: number, cy: number, scale: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx, cy + 7 * scale);
  p.cubicTo(cx - 11 * scale, cy, cx - 6.5 * scale, cy - 9 * scale, cx, cy - 4 * scale);
  p.cubicTo(cx + 6.5 * scale, cy - 9 * scale, cx + 11 * scale, cy, cx, cy + 7 * scale);
  p.close();
  return p;
}
