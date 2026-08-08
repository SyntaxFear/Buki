import { PaintStyle, Skia, type SkImage } from "@shopify/react-native-skia";

import type { Drawing } from "@/store/drawings";
import { colors } from "@/theme";
import { fitRect, type Rect } from "@/utils/book-layout";
import { PAD_GEOMETRY } from "@/pad-designs";

export const PAGE_FACE_RADIUS = PAD_GEOMETRY.pageRadius;
export const PAGE_DOT_INSET = 12;
export const PAGE_DOT_END_INSET = 6;
export const PAGE_DOT_STEP = 17;
export const PAGE_DOT_RADIUS = 0.9;

/**
 * A soft, two-sided page fold inspired by StPageFlip's geometry: the free
 * corner leads the motion, a diagonal crease travels toward the binding, and
 * separate inner/outer shadows preserve the sense of paper thickness. The
 * same canonical shader is transposed for top-bound pads.
 */
const PAGE_FLIP_SKSL = `
uniform shader page;
uniform shader back;
uniform shader underLeft;
uniform shader underRight;
uniform float2 origin;
uniform float2 size;
uniform float t;
uniform float transposed;
uniform float spineOff;
uniform float curl;
uniform float hasLeftBase;

half4 sampleFront(float s, float v) {
  float2 c = transposed > 0.5 ? float2(v, s) : float2(s, v);
  return page.eval(c);
}

half4 sampleBack(float s, float v, float pw) {
  float2 c = transposed > 0.5 ? float2(v, pw - s) : float2(pw - s, v);
  return back.eval(c);
}

half4 sampleUnderLeft(float s, float v) {
  float2 c = transposed > 0.5 ? float2(v, s) : float2(s, v);
  return underLeft.eval(c);
}

half4 sampleUnderRight(float s, float v) {
  float2 c = transposed > 0.5 ? float2(v, s) : float2(s, v);
  return underRight.eval(c);
}

half4 main(float2 xy) {
  const float PI = 3.141592653589793;
  float2 local = xy - origin;
  float u = (transposed > 0.5 ? local.y : local.x) - spineOff;
  float v = transposed > 0.5 ? local.x : local.y;
  float pw = size.x;
  float ph = size.y;

  if (v < 0.0 || v > ph) {
    return half4(0.0);
  }

  float progress = clamp(t, 0.0, 1.0);
  float bend = sin(progress * PI);
  float anchor = clamp(curl, 0.08, 0.92);
  float cross = clamp(v / max(ph, 1.0), 0.0, 1.0);
  float side = anchor < 0.5 ? 1.0 : -1.0;

  // The crease is straight at rest and at landing, but diagonal while the
  // selected corner is leading. Its free edge travels from +pw to -pw, which
  // is the same 50% completion geometry used by StPageFlip.
  float tilt = pw * 0.42 * bend;
  float crease = pw * (1.0 - progress) + side * tilt * (cross - anchor);
  float tip = 2.0 * crease - pw;
  float shadowWidth = max(8.0, pw * (0.05 + 0.13 * bend));

  // Paint the stationary pages inside this same shader pass. This makes the
  // first and last frames visually complete even if React mounts or removes
  // the flip node one frame earlier/later under load.
  half4 result = half4(0.0);
  if (u >= 0.0 && u <= pw) {
    result = sampleUnderRight(u, v);
  } else if (hasLeftBase > 0.5 && u >= -pw && u < 0.0) {
    result = sampleUnderLeft(u + pw, v);
  }

  // Flat portion still attached to the binding.
  if (u >= 0.0 && u <= pw && u <= crease) {
    half4 front = sampleFront(u, v);
    float nearCrease = 1.0 - clamp((crease - u) / shadowWidth, 0.0, 1.0);
    float shade = 1.0 - 0.18 * bend * nearCrease;
    result = half4(front.rgb * shade, front.a);
  }

  // Shadow on the page being uncovered, directly beyond the travelling fold.
  if (u > crease && u <= crease + shadowWidth) {
    float falloff = 1.0 - (u - crease) / shadowWidth;
    float shade = 0.24 * bend * falloff * falloff;
    result = half4(result.rgb * (1.0 - shade), result.a);
  }

  // The free edge needs only a narrow contact shadow. Tying this width to the
  // page-sized crease shadow made tall pads produce a second triangular end.
  float tipShadowWidth = 2.0 + 5.0 * bend;
  if (u < tip && u >= tip - tipShadowWidth) {
    float falloff = 1.0 - (tip - u) / tipShadowWidth;
    float shade = 0.10 * bend * falloff * falloff;
    result = half4(result.rgb * (1.0 - shade), result.a);
  }

  // Folded portion. Mirroring across the crease preserves the sheet's length;
  // the back snapshot is sampled in display orientation for the receiving page.
  if (crease < pw && u >= tip && u <= crease) {
    float source = 2.0 * crease - u;
    if (source >= 0.0 && source <= pw) {
      half4 folded = sampleBack(source, v, pw);
      float foldSpan = max(crease - tip, 1.0);
      float foldPosition = clamp((crease - u) / foldSpan, 0.0, 1.0);
      float creaseShade = smoothstep(0.02, 0.72, foldPosition);
      float rim = 1.0 - smoothstep(0.0, 0.16, foldPosition);
      float freeEdge = smoothstep(0.88, 1.0, foldPosition);
      float curvedShade = 0.76 + 0.22 * creaseShade + 0.08 * rim;
      float shade = mix(1.0, curvedShade, bend);
      shade *= 1.0 - 0.06 * bend * freeEdge;
      float tipAlpha = smoothstep(tip - 1.2, tip + 1.2, u);
      float creaseAlpha = 1.0 - smoothstep(crease, crease + 1.2, u);
      float alpha = tipAlpha * creaseAlpha * folded.a;
      result = mix(result, half4(folded.rgb * shade, folded.a), alpha);
    }
  }

  return result;
}
`;

export const PAGE_FLIP_EFFECT = Skia.RuntimeEffect.Make(PAGE_FLIP_SKSL);
if (!PAGE_FLIP_EFFECT) {
  console.warn("Buki: page-flip shader failed to compile");
}

export interface FaceItem {
  drawing: Drawing;
  image: SkImage | null;
  /** Slot in page-local coordinates */
  slotLocal: Rect;
}

/**
 * Render one page face — rounded paper, dot grid, and any drawings
 * fitted into their slots — as an offscreen image in natural screen
 * orientation (pageW × pageH points, 3x supersampled).
 */
export function buildFaceSnapshot(
  pageW: number,
  pageH: number,
  items: FaceItem[],
  pageColor: string = colors.page,
  dotColor: string = colors.gridDot,
  guideRects: Rect[] = [],
  guideColor: string = colors.slotBorder,
): SkImage | null {
  // Match modern 3x iPhone screens so curved page edges remain smooth while
  // the sheet is moving through the shader.
  const SS = 3;
  const surface = Skia.Surface.Make(Math.ceil(pageW * SS), Math.ceil(pageH * SS));
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(SS, SS);

  const pagePaint = Skia.Paint();
  pagePaint.setColor(Skia.Color(pageColor));
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(0, 0, pageW, pageH),
      PAGE_FACE_RADIUS,
      PAGE_FACE_RADIUS,
    ),
    pagePaint,
  );

  const borderPaint = Skia.Paint();
  borderPaint.setColor(Skia.Color(colors.border));
  borderPaint.setStyle(PaintStyle.Stroke);
  borderPaint.setStrokeWidth(1);
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(2, 2, pageW - 4, pageH - 4),
      PAGE_FACE_RADIUS - 2,
      PAGE_FACE_RADIUS - 2,
    ),
    borderPaint,
  );

  const dotPaint = Skia.Paint();
  dotPaint.setColor(Skia.Color(dotColor));
  for (let y = PAGE_DOT_INSET; y < pageH - PAGE_DOT_END_INSET; y += PAGE_DOT_STEP) {
    for (let x = PAGE_DOT_INSET; x < pageW - PAGE_DOT_END_INSET; x += PAGE_DOT_STEP) {
      canvas.drawCircle(x, y, PAGE_DOT_RADIUS, dotPaint);
    }
  }

  if (guideRects.length > 0) {
    const guidePaint = Skia.Paint();
    guidePaint.setColor(Skia.Color(guideColor));
    guidePaint.setStyle(PaintStyle.Stroke);
    guidePaint.setStrokeWidth(1.25);
    for (const guide of guideRects) {
      canvas.drawRRect(
        Skia.RRectXY(
          Skia.XYWHRect(guide.x, guide.y, guide.width, guide.height),
          PAD_GEOMETRY.slotRadius,
          PAD_GEOMETRY.slotRadius,
        ),
        guidePaint,
      );
    }
  }

  for (const { drawing, image, slotLocal } of items) {
    if (!image) continue;
    const r = fitRect(drawing.width, drawing.height, slotLocal);
    canvas.save();
    canvas.rotate(drawing.rotation, r.x + r.width / 2, r.y + r.height / 2);
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: image.width(), height: image.height() },
      { x: r.x, y: r.y, width: r.width, height: r.height },
      Skia.Paint(),
    );
    canvas.restore();
  }
  return surface.makeImageSnapshot();
}
