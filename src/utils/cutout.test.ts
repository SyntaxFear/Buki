import {
  detectPaper,
  extractDrawing,
  luminance,
  otsuThreshold,
  paperQuad,
  rectifiedSize,
  warpQuadToRect,
  type Quad,
} from "./cutout";

type RGB = [number, number, number];

const TABLE: RGB = [72, 52, 36];
const PAPER: RGB = [242, 240, 232];

function makeImage(w: number, h: number, fill: RGB): Uint8Array {
  const img = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    img[i * 4] = fill[0];
    img[i * 4 + 1] = fill[1];
    img[i * 4 + 2] = fill[2];
    img[i * 4 + 3] = 255;
  }
  return img;
}

function drawRect(
  img: Uint8Array,
  imgW: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const p = (yy * imgW + xx) * 4;
      img[p] = color[0];
      img[p + 1] = color[1];
      img[p + 2] = color[2];
    }
  }
}

/** Photo fixture: paper sheet on a dark table. */
function makePhoto(w = 240, h = 180): { img: Uint8Array; paper: { x: number; y: number; w: number; h: number } } {
  const img = makeImage(w, h, TABLE);
  const paper = { x: 40, y: 30, w: 150, h: 120 };
  drawRect(img, w, paper.x, paper.y, paper.w, paper.h, PAPER);
  return { img, paper };
}

function alphaAt(result: NonNullable<ReturnType<typeof extractDrawing>>, srcX: number, srcY: number): number {
  const x = srcX - result.inkBox.x;
  const y = srcY - result.inkBox.y;
  if (x < 0 || y < 0 || x >= result.width || y >= result.height) return 0;
  return result.pixels[(y * result.width + x) * 4 + 3];
}

describe("otsuThreshold", () => {
  it("splits a bimodal distribution between the modes", () => {
    const lum = new Uint8Array(1000);
    lum.fill(50, 0, 600);
    lum.fill(220, 600);
    const t = otsuThreshold(lum);
    expect(t).toBeGreaterThan(50);
    expect(t).toBeLessThanOrEqual(220);
  });
});

describe("detectPaper", () => {
  it("finds the paper bounding box on a dark table", () => {
    const { img, paper } = makePhoto();
    const lum = luminance(img, 240, 180);
    const detected = detectPaper(lum, 240, 180);
    expect(detected).not.toBeNull();
    const box = detected!.box;
    expect(Math.abs(box.x - paper.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(box.y - paper.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(box.w - paper.w)).toBeLessThanOrEqual(12);
    expect(Math.abs(box.h - paper.h)).toBeLessThanOrEqual(12);
  });
});

describe("extractDrawing", () => {
  it("extracts dark strokes and keeps plain paper transparent", () => {
    const { img } = makePhoto();
    drawRect(img, 240, 90, 70, 60, 10, [30, 30, 30]); // thick dark line
    drawRect(img, 240, 100, 100, 40, 12, [200, 40, 40]); // red stroke

    const result = extractDrawing(img, 240, 180);
    expect(result).not.toBeNull();

    // Strokes are strongly opaque
    expect(alphaAt(result!, 120, 75)).toBeGreaterThan(200);
    expect(alphaAt(result!, 120, 106)).toBeGreaterThan(150);

    // The cutout stays inside the paper
    expect(result!.inkBox.x).toBeGreaterThanOrEqual(40);
    expect(result!.inkBox.y).toBeGreaterThanOrEqual(30);
    expect(result!.inkBox.x + result!.inkBox.w).toBeLessThanOrEqual(40 + 150 + 1);
    expect(result!.inkBox.y + result!.inkBox.h).toBeLessThanOrEqual(30 + 120 + 1);

    // Plain paper inside the cutout box is transparent
    let paperAlpha = 0;
    for (let y = 0; y < result!.height; y++) {
      // sample the corner row far from strokes
      paperAlpha = Math.max(paperAlpha, result!.pixels[(y * result!.width + 0) * 4 + 3]);
    }
    expect(paperAlpha).toBeLessThan(40);
  });

  it("keeps colored crayon strokes, including light colors", () => {
    const { img } = makePhoto();
    const colors: RGB[] = [
      [40, 40, 40], // pencil
      [200, 60, 50], // red crayon
      [70, 140, 80], // green crayon
      [110, 150, 215], // light blue crayon
    ];
    colors.forEach((c, i) => {
      drawRect(img, 240, 60 + i * 32, 60, 24, 14, c);
    });

    const result = extractDrawing(img, 240, 180);
    expect(result).not.toBeNull();
    colors.forEach((_, i) => {
      expect(alphaAt(result!, 60 + i * 32 + 12, 67)).toBeGreaterThan(140);
    });
  });

  it("removes isolated speckles but keeps the real stroke", () => {
    const { img } = makePhoto();
    drawRect(img, 240, 80, 80, 70, 12, [25, 25, 25]);
    // deterministic dust: single dark pixels scattered on the paper
    const dust: [number, number][] = [
      [50, 40], [60, 130], [170, 45], [175, 135], [55, 90],
      [165, 90], [100, 45], [140, 135], [48, 60], [180, 60],
    ];
    for (const [x, y] of dust) {
      drawRect(img, 240, x, y, 1, 1, [20, 20, 20]);
    }

    const result = extractDrawing(img, 240, 180);
    expect(result).not.toBeNull();
    expect(alphaAt(result!, 115, 86)).toBeGreaterThan(200);
    for (const [x, y] of dust) {
      expect(alphaAt(result!, x, y)).toBe(0);
    }
  });

  it("does not leak table pixels through a tilted paper's bbox corners", () => {
    const w = 240;
    const h = 180;
    const img = makeImage(w, h, TABLE);
    // rotated paper: center (120,90), half-extents 70x55, tilted ~12°
    const angle = (12 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const inPaper = (x: number, y: number) => {
      const dx = x - 120;
      const dy = y - 90;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      return Math.abs(u) <= 70 && Math.abs(v) <= 55;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inPaper(x, y)) continue;
        const p = (y * w + x) * 4;
        img[p] = PAPER[0];
        img[p + 1] = PAPER[1];
        img[p + 2] = PAPER[2];
      }
    }
    // stroke across the middle of the paper (in paper frame)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - 120;
        const dy = y - 90;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (Math.abs(v) <= 5 && Math.abs(u) <= 50) {
          const p = (y * w + x) * 4;
          img[p] = 30;
          img[p + 1] = 30;
          img[p + 2] = 30;
        }
      }
    }

    const result = extractDrawing(img, 240, 180);
    expect(result).not.toBeNull();
    // The tilted sheet is rectified, so assert in output space: the stroke
    // center is opaque and dark
    const midP = ((result!.height >> 1) * result!.width + (result!.width >> 1)) * 4;
    expect(result!.pixels[midP + 3]).toBeGreaterThan(200);
    expect(result!.pixels[midP]).toBeLessThan(90);
    // No wood slivers: every opaque pixel must look like ink on paper, not
    // like the table (dark warm brown)
    for (let y = 0; y < result!.height; y++) {
      for (let x = 0; x < result!.width; x++) {
        const p = (y * result!.width + x) * 4;
        if (result!.pixels[p + 3] > 40) {
          const isTable =
            Math.abs(result!.pixels[p] - TABLE[0]) < 14 &&
            Math.abs(result!.pixels[p + 1] - TABLE[1]) < 14 &&
            Math.abs(result!.pixels[p + 2] - TABLE[2]) < 14;
          expect(isTable).toBe(false);
        }
      }
    }
    // inkBox still lands on the sheet in source coordinates (for overlays)
    expect(inPaper(result!.inkBox.x + result!.inkBox.w / 2, result!.inkBox.y + result!.inkBox.h / 2)).toBe(true);
  });

  it("returns null for blank paper", () => {
    const { img } = makePhoto();
    expect(extractDrawing(img, 240, 180)).toBeNull();
  });

  it("returns null when there is no paper at all", () => {
    const img = makeImage(240, 180, TABLE);
    expect(extractDrawing(img, 240, 180)).toBeNull();
  });
});

/** Paint a convex quad region using bilinear paper coordinates (u,v ∈ [0,1]). */
function paintQuad(
  img: Uint8Array,
  imgW: number,
  imgH: number,
  quad: Quad,
  colorAt: (u: number, v: number) => RGB | null,
): void {
  const steps = 900;
  for (let vi = 0; vi <= steps; vi++) {
    const v = vi / steps;
    for (let ui = 0; ui <= steps; ui++) {
      const u = ui / steps;
      const c = colorAt(u, v);
      if (!c) continue;
      const topX = quad.tl.x + (quad.tr.x - quad.tl.x) * u;
      const topY = quad.tl.y + (quad.tr.y - quad.tl.y) * u;
      const botX = quad.bl.x + (quad.br.x - quad.bl.x) * u;
      const botY = quad.bl.y + (quad.br.y - quad.bl.y) * u;
      const x = Math.round(topX + (botX - topX) * v);
      const y = Math.round(topY + (botY - topY) * v);
      if (x < 0 || y < 0 || x >= imgW || y >= imgH) continue;
      const p = (y * imgW + x) * 4;
      img[p] = c[0];
      img[p + 1] = c[1];
      img[p + 2] = c[2];
    }
  }
}

describe("warpQuadToRect", () => {
  it("is the identity for an axis-aligned quad", () => {
    const { img } = makePhoto();
    drawRect(img, 240, 90, 70, 30, 12, [30, 120, 200]);
    const quad: Quad = {
      tl: { x: 80, y: 60 },
      tr: { x: 159, y: 60 },
      br: { x: 159, y: 119 },
      bl: { x: 80, y: 119 },
    };
    const out = warpQuadToRect(img, 240, 180, quad, 80, 60);
    for (const [sx, sy] of [
      [95, 75],
      [110, 78],
      [85, 65],
      [150, 110],
    ] as const) {
      const src = (sy * 240 + sx) * 4;
      const dst = ((sy - 60) * 80 + (sx - 80)) * 4;
      expect(Math.abs(out[dst] - img[src])).toBeLessThanOrEqual(2);
      expect(Math.abs(out[dst + 1] - img[src + 1])).toBeLessThanOrEqual(2);
      expect(Math.abs(out[dst + 2] - img[src + 2])).toBeLessThanOrEqual(2);
    }
  });

  it("rectifies a rotated square so its center mark lands in the middle", () => {
    const w = 120;
    const h = 120;
    const img = makeImage(w, h, TABLE);
    const angle = (25 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = 60;
    const cy = 60;
    const ext = 34;
    const corner = (uu: number, vv: number) => ({
      x: cx + uu * ext * cos - vv * ext * sin,
      y: cy + uu * ext * sin + vv * ext * cos,
    });
    const quad: Quad = {
      tl: corner(-1, -1),
      tr: corner(1, -1),
      br: corner(1, 1),
      bl: corner(-1, 1),
    };
    paintQuad(img, w, h, quad, (u, v) => {
      const du = u - 0.5;
      const dv = v - 0.5;
      if (Math.sqrt(du * du + dv * dv) < 0.08) return [210, 40, 40];
      return PAPER;
    });

    const size = rectifiedSize(quad);
    expect(size.w).toBeGreaterThan(50);
    expect(Math.abs(size.w - size.h)).toBeLessThanOrEqual(4);

    const out = warpQuadToRect(img, w, h, quad, size.w, size.h);
    const mid = ((size.h >> 1) * size.w + (size.w >> 1)) * 4;
    expect(out[mid]).toBeGreaterThan(150);
    expect(out[mid + 1]).toBeLessThan(110);
    // corners are paper, not table
    for (const [x, y] of [
      [3, 3],
      [size.w - 4, 3],
      [size.w - 4, size.h - 4],
      [3, size.h - 4],
    ] as const) {
      const p = (y * size.w + x) * 4;
      expect(out[p]).toBeGreaterThan(180);
    }
  });
});

describe("paperQuad + perspective extractDrawing", () => {
  const skewQuad: Quad = {
    tl: { x: 50, y: 55 },
    tr: { x: 205, y: 18 },
    br: { x: 195, y: 152 },
    bl: { x: 42, y: 122 },
  };

  function makeSkewPhoto(): Uint8Array {
    const img = makeImage(240, 180, TABLE);
    paintQuad(img, 240, 180, skewQuad, (u, v) => {
      // horizontal bar in PAPER space
      if (u > 0.15 && u < 0.85 && v > 0.44 && v < 0.56) return [25, 25, 25];
      return PAPER;
    });
    return img;
  }

  it("finds corners close to the true quad", () => {
    const img = makeSkewPhoto();
    const lum = luminance(img, 240, 180);
    const det = detectPaper(lum, 240, 180);
    expect(det).not.toBeNull();
    const q = paperQuad(det!);
    for (const key of ["tl", "tr", "br", "bl"] as const) {
      expect(Math.abs(q[key].x - skewQuad[key].x)).toBeLessThanOrEqual(10);
      expect(Math.abs(q[key].y - skewQuad[key].y)).toBeLessThanOrEqual(10);
    }
  });

  it("rectifies the sheet so a paper-horizontal stroke comes out flat", () => {
    const img = makeSkewPhoto();
    const result = extractDrawing(img, 240, 180);
    expect(result).not.toBeNull();
    // Un-dewarped, the bar slopes ~37px over its width, giving bbox aspect
    // ≈ 0.5 with padding. Rectified, the bar plus ink padding stays thin.
    expect(result!.height / result!.width).toBeLessThan(0.35);

    // Center row is solidly opaque across most of the bar
    const midY = result!.height >> 1;
    let opaque = 0;
    for (let x = 0; x < result!.width; x++) {
      if (result!.pixels[(midY * result!.width + x) * 4 + 3] > 128) opaque++;
    }
    expect(opaque / result!.width).toBeGreaterThan(0.55);

    // Top row is fully transparent (no slanted remnants)
    let topMax = 0;
    for (let x = 0; x < result!.width; x++) {
      topMax = Math.max(topMax, result!.pixels[(0 * result!.width + x) * 4 + 3]);
    }
    expect(topMax).toBeLessThan(40);
  });
});
