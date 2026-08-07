import { Skia, type SkImage } from "@shopify/react-native-skia";

import type { Drawing } from "@/store/drawings";
import { colors } from "@/theme";
import { fitRect, type Rect } from "@/utils/book-layout";

/**
 * Page curl as a cylinder roll. Generalized over the roll axis: `transpose 0`
 * rolls left/right around a vertical axis at the spine (horizontal spread
 * book), `transpose 1` rolls up/down around the top binding (vertical flip
 * pad). `u` runs along the roll direction from the spine/binding; `v` runs
 * across it. Front/back faces are sampled from child shaders in natural
 * screen orientation; output is transparent wherever the page has peeled
 * away so the underlying page shows through.
 */
const CURL_SKSL = `
uniform shader page;
uniform shader back;
uniform float2 origin;
uniform float2 size;
uniform float t;
uniform float transposed;
uniform float spineOff;
uniform float hasBack;

half4 sampleFront(float s, float v) {
  float2 c = transposed > 0.5 ? float2(v, s) : float2(s, v);
  return page.eval(c);
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

  float R = pw * 0.16;
  float c = pw - t * (pw + PI * R + R);
  float fade = 1.0 - smoothstep(0.86, 1.0, t);
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
      half4 col = sampleFront(s2, v);
      float shade = 0.72 + 0.28 * ratio;
      return half4(col.rgb * shade, col.a) * fade;
    }
    float s1 = c + R * a1;
    if (s1 >= 0.0 && s1 <= pw) {
      half4 col = sampleFront(s1, v);
      float shade = 0.86 + 0.14 * (1.0 - ratio);
      return half4(col.rgb * shade, col.a) * fade;
    }
    return half4(0.0);
  }

  if (u <= c) {
    // Back of the page, laid over whatever is behind the roll
    float sBack = 2.0 * c + PI * R - u;
    if (sBack >= 0.0 && sBack <= pw && u >= -pw - spineOff) {
      float edge = clamp((c - u) / (R * 1.5), 0.0, 1.0);
      float shade = 0.90 + 0.08 * edge;
      half3 cream = half3(0.985, 0.964, 0.925);
      half3 rgb = cream;
      if (hasBack > 0.5) {
        float2 bc = transposed > 0.5 ? float2(v, pw - sBack) : float2(pw - sBack, v);
        half4 bcol = back.eval(bc);
        rgb = mix(cream, bcol.rgb, bcol.a);
      }
      return half4(rgb * shade, 1.0) * fade;
    }
    // Still-flat part of the page, attached at the spine
    if (u >= 0.0 && u <= pw) {
      half4 col = sampleFront(u, v);
      float sh = 1.0 - 0.22 * exp(-abs(c - u) / max(R * 0.8, 1.0));
      return half4(col.rgb * sh, col.a);
    }
  }
  return half4(0.0);
}
`;

export const CURL_EFFECT = Skia.RuntimeEffect.Make(CURL_SKSL);
if (!CURL_EFFECT) {
  console.warn("Buki: page-curl shader failed to compile, using fold fallback");
}

export interface FaceItem {
  drawing: Drawing;
  image: SkImage | null;
  /** Slot in page-local coordinates */
  slotLocal: Rect;
}

/**
 * Render one page face — cream rounded page, dot grid, and any drawings
 * fitted into their slots — as an offscreen image in natural screen
 * orientation (pageW × pageH points, 2x supersampled).
 */
export function buildFaceSnapshot(
  pageW: number,
  pageH: number,
  items: FaceItem[],
  pageColor: string = colors.page,
): SkImage | null {
  const SS = 2;
  const surface = Skia.Surface.Make(Math.ceil(pageW * SS), Math.ceil(pageH * SS));
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(SS, SS);

  const pagePaint = Skia.Paint();
  pagePaint.setColor(Skia.Color(pageColor));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, pageW, pageH), 8, 8), pagePaint);

  const dotPaint = Skia.Paint();
  dotPaint.setColor(Skia.Color("rgba(120,100,70,0.09)"));
  for (let y = 12; y < pageH - 6; y += 17) {
    for (let x = 12; x < pageW - 6; x += 17) {
      canvas.drawCircle(x, y, 0.9, dotPaint);
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
