import {
  Blur,
  Circle,
  Group,
  Path,
  RoundedRect,
  Skia,
} from "@shopify/react-native-skia";

import { PAD_GEOMETRY, type PadStamp, type PadTabGlyph } from "@/pad-designs";

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

function heartPath(cx: number, cy: number, scale: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx, cy + 7 * scale);
  p.cubicTo(cx - 11 * scale, cy, cx - 6.5 * scale, cy - 9 * scale, cx, cy - 4 * scale);
  p.cubicTo(cx + 6.5 * scale, cy - 9 * scale, cx + 11 * scale, cy, cx, cy + 7 * scale);
  p.close();
  return p;
}
