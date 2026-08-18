// Pure pixel pipeline: finds the sheet of paper in a photo and extracts the
// drawn strokes as an RGBA cutout with soft alpha. No Skia imports — the
// caller (imageio.ts) owns decoding/encoding. Everything here is testable
// with plain Uint8Arrays.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutoutResult {
  /** RGBA, unpremultiplied; alpha is the ink mask */
  pixels: Uint8Array;
  width: number;
  height: number;
  /** Detected paper bounds in source coordinates */
  paperBox: Box;
  /** Cutout bounds in source coordinates */
  inkBox: Box;
}

export interface CutoutOptions {
  /** Color distance from paper where alpha starts rising (default 26) */
  inkDistLow?: number;
  /** Color distance from paper where alpha saturates (default 68) */
  inkDistHigh?: number;
  /** Internal: set on the recursive pass over an already-rectified sheet */
  disableDewarp?: boolean;
}

export interface Pt {
  x: number;
  y: number;
}

/** Paper corners in source pixels, ordered TL/TR/BR/BL. */
export interface Quad {
  tl: Pt;
  tr: Pt;
  br: Pt;
  bl: Pt;
}

/** Corner deviation from the quad's own bbox beyond which we rectify */
const DEWARP_SKEW_MIN = 0.035;

const PAPER_INSET_FRAC = 0.025;
const FULL_FRAME_INSET_FRAC = 0.005;
const INK_PAD_FRAC = 0.05;
/** Grid downscale factor for paper detection */
const PAPER_GRID = 4;
/** Grid downscale factor for despeckle */
const SPECK_GRID = 2;
const MIN_PAPER_SURFACE_LUMINANCE = 155;
const NEUTRAL_PAPER_MIN_LUMINANCE = 180;
const NEUTRAL_PAPER_MAX_CHROMA = 24;
const MIN_NEUTRAL_PAPER_SAMPLES = 32;

export function luminance(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return out;
}

/** Classic Otsu threshold over a 256-bin histogram. */
export function otsuThreshold(lum: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  const total = lum.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestStart = 127;
  let bestEnd = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestStart = t;
      bestEnd = t;
    } else if (between === best) {
      // Plateau (empty histogram gap): extend and split it down the middle,
      // otherwise the threshold sits exactly on the dark mode's value.
      bestEnd = t;
    }
  }
  return (bestStart + bestEnd) >> 1;
}

interface PaperDetection {
  box: Box;
  threshold: number;
  /** membership grid of the winning bright component, at PAPER_GRID scale */
  grid: Uint8Array;
  gridW: number;
  gridH: number;
}

/**
 * Threshold the luminance, find the largest bright connected component
 * (assumed to be the paper) on a downscaled grid, return its bbox.
 */
export function detectPaper(lum: Uint8Array, width: number, height: number): PaperDetection | null {
  const threshold = otsuThreshold(lum);
  const gw = Math.max(1, Math.floor(width / PAPER_GRID));
  const gh = Math.max(1, Math.floor(height / PAPER_GRID));
  const bright = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const sy = gy * PAPER_GRID;
    for (let gx = 0; gx < gw; gx++) {
      const sx = gx * PAPER_GRID;
      bright[gy * gw + gx] = lum[sy * width + sx] >= threshold ? 1 : 0;
    }
  }

  // Largest connected component via BFS (4-connected)
  const labels = new Int32Array(gw * gh).fill(-1);
  const queue = new Int32Array(gw * gh);
  let bestSize = 0;
  let bestLabel = -1;
  let nextLabel = 0;
  for (let start = 0; start < bright.length; start++) {
    if (!bright[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = nextLabel;
    let size = 0;
    while (head < tail) {
      const idx = queue[head++];
      size++;
      const x = idx % gw;
      const y = (idx / gw) | 0;
      if (x > 0 && bright[idx - 1] && labels[idx - 1] === -1) {
        labels[idx - 1] = nextLabel;
        queue[tail++] = idx - 1;
      }
      if (x < gw - 1 && bright[idx + 1] && labels[idx + 1] === -1) {
        labels[idx + 1] = nextLabel;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && bright[idx - gw] && labels[idx - gw] === -1) {
        labels[idx - gw] = nextLabel;
        queue[tail++] = idx - gw;
      }
      if (y < gh - 1 && bright[idx + gw] && labels[idx + gw] === -1) {
        labels[idx + gw] = nextLabel;
        queue[tail++] = idx + gw;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = nextLabel;
    }
    nextLabel++;
  }

  // Require the paper to cover a meaningful part of the frame
  if (bestLabel === -1 || bestSize < gw * gh * 0.02) return null;

  let minX = gw;
  let minY = gh;
  let maxX = -1;
  let maxY = -1;
  const grid = new Uint8Array(gw * gh);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== bestLabel) continue;
    grid[i] = 1;
    const x = i % gw;
    const y = (i / gw) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const box: Box = {
    x: minX * PAPER_GRID,
    y: minY * PAPER_GRID,
    w: (maxX - minX + 1) * PAPER_GRID,
    h: (maxY - minY + 1) * PAPER_GRID,
  };
  return { box, threshold, grid: fillAndErode(grid, gw, gh), gridW: gw, gridH: gh };
}

/**
 * The bright-component grid has holes where ink strokes sit (they are dark),
 * and a tilted sheet leaves table corners inside its bounding box. Fill the
 * interior holes so strokes stay, then erode one cell so the paper/table
 * transition edge is cut away.
 */
function fillAndErode(grid: Uint8Array, gw: number, gh: number): Uint8Array {
  // Flood from the border across non-paper cells: whatever is reached is
  // outside; unreached non-paper cells are interior holes (ink) — keep them.
  const outside = new Uint8Array(gw * gh);
  const queue = new Int32Array(gw * gh);
  let tail = 0;
  const push = (i: number) => {
    if (!grid[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < gw; x++) {
    push(x);
    push((gh - 1) * gw + x);
  }
  for (let y = 0; y < gh; y++) {
    push(y * gw);
    push(y * gw + gw - 1);
  }
  let head = 0;
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % gw;
    const y = (idx / gw) | 0;
    if (x > 0) push(idx - 1);
    if (x < gw - 1) push(idx + 1);
    if (y > 0) push(idx - gw);
    if (y < gh - 1) push(idx + gw);
  }

  const filled = new Uint8Array(gw * gh);
  for (let i = 0; i < filled.length; i++) filled[i] = outside[i] ? 0 : 1;

  // Erode by one cell (4-neighborhood)
  const eroded = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!filled[i]) continue;
      const left = x > 0 ? filled[i - 1] : 0;
      const right = x < gw - 1 ? filled[i + 1] : 0;
      const up = y > 0 ? filled[i - gw] : 0;
      const down = y < gh - 1 ? filled[i + gw] : 0;
      eroded[i] = left && right && up && down ? 1 : 0;
    }
  }
  return eroded;
}

/**
 * Corners of the detected paper component via the extreme-point method
 * (min/max of x+y and x−y over the membership grid). Convex sheets only,
 * which is what a photographed page is.
 */
export function paperQuad(det: PaperDetection): Quad {
  const { grid, gridW: gw, gridH: gh } = det;
  let tl: Pt = { x: 0, y: 0 };
  let tr: Pt = { x: 0, y: 0 };
  let br: Pt = { x: 0, y: 0 };
  let bl: Pt = { x: 0, y: 0 };
  let sTL = Infinity;
  let sBR = -Infinity;
  let dTR = -Infinity;
  let dBL = Infinity;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!grid[y * gw + x]) continue;
      const sum = x + y;
      const diff = x - y;
      if (sum < sTL) {
        sTL = sum;
        tl = { x, y };
      }
      if (sum > sBR) {
        sBR = sum;
        br = { x, y };
      }
      if (diff > dTR) {
        dTR = diff;
        tr = { x, y };
      }
      if (diff < dBL) {
        dBL = diff;
        bl = { x, y };
      }
    }
  }
  const half = PAPER_GRID / 2;
  const px = (p: Pt): Pt => ({ x: p.x * PAPER_GRID + half, y: p.y * PAPER_GRID + half });
  return { tl: px(tl), tr: px(tr), br: px(br), bl: px(bl) };
}

/** Max corner deviation from the quad's bbox, relative to the bbox size. */
function quadSkew(q: Quad): number {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x];
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const size = Math.max(maxX - minX, maxY - minY);
  if (size <= 0) return 0;
  const dev = Math.max(
    Math.hypot(q.tl.x - minX, q.tl.y - minY),
    Math.hypot(q.tr.x - maxX, q.tr.y - minY),
    Math.hypot(q.br.x - maxX, q.br.y - maxY),
    Math.hypot(q.bl.x - minX, q.bl.y - maxY),
  );
  return dev / size;
}

interface SquareToQuad {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Projective map from the unit square to the quad (Heckbert's derivation):
 * x(u,v) = (a·u + b·v + c) / (g·u + h·v + 1), same shape for y.
 */
function squareToQuad(q: Quad): SquareToQuad {
  const dx1 = q.tr.x - q.br.x;
  const dx2 = q.bl.x - q.br.x;
  const sx = q.tl.x - q.tr.x + q.br.x - q.bl.x;
  const dy1 = q.tr.y - q.br.y;
  const dy2 = q.bl.y - q.br.y;
  const sy = q.tl.y - q.tr.y + q.br.y - q.bl.y;

  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return {
      a: q.tr.x - q.tl.x,
      b: q.bl.x - q.tl.x,
      c: q.tl.x,
      d: q.tr.y - q.tl.y,
      e: q.bl.y - q.tl.y,
      f: q.tl.y,
      g: 0,
      h: 0,
    };
  }
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return {
    a: q.tr.x - q.tl.x + g * q.tr.x,
    b: q.bl.x - q.tl.x + h * q.bl.x,
    c: q.tl.x,
    d: q.tr.y - q.tl.y + g * q.tr.y,
    e: q.bl.y - q.tl.y + h * q.bl.y,
    f: q.tl.y,
    g,
    h,
  };
}

function mapUnit(m: SquareToQuad, u: number, v: number): Pt {
  const w = m.g * u + m.h * v + 1;
  return { x: (m.a * u + m.b * v + m.c) / w, y: (m.d * u + m.e * v + m.f) / w };
}

/** Output size for a rectified quad, from its longer opposite-edge pairs. */
export function rectifiedSize(quad: Quad, cap = 1600): { w: number; h: number } {
  const len = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);
  let w = Math.max(len(quad.tl, quad.tr), len(quad.bl, quad.br));
  let h = Math.max(len(quad.tl, quad.bl), len(quad.tr, quad.br));
  const scale = Math.min(1, cap / Math.max(w, h));
  w = Math.max(8, Math.round(w * scale));
  h = Math.max(8, Math.round(h * scale));
  return { w, h };
}

/** Warp the quad region of an RGBA image into an axis-aligned rect (bilinear). */
export function warpQuadToRect(
  rgba: Uint8Array,
  width: number,
  height: number,
  quad: Quad,
  outW: number,
  outH: number,
): Uint8Array {
  const m = squareToQuad(quad);
  const out = new Uint8Array(outW * outH * 4);
  const maxX = width - 1;
  const maxY = height - 1;
  for (let y = 0; y < outH; y++) {
    const v = outH > 1 ? y / (outH - 1) : 0;
    for (let x = 0; x < outW; x++) {
      const u = outW > 1 ? x / (outW - 1) : 0;
      const s = mapUnit(m, u, v);
      const sx = Math.min(maxX, Math.max(0, s.x));
      const sy = Math.min(maxY, Math.max(0, s.y));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(maxX, x0 + 1);
      const y1 = Math.min(maxY, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const p00 = (y0 * width + x0) * 4;
      const p10 = (y0 * width + x1) * 4;
      const p01 = (y1 * width + x0) * 4;
      const p11 = (y1 * width + x1) * 4;
      const dst = (y * outW + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = rgba[p00 + ch] * (1 - fx) + rgba[p10 + ch] * fx;
        const bot = rgba[p01 + ch] * (1 - fx) + rgba[p11 + ch] * fx;
        out[dst + ch] = Math.round(top * (1 - fy) + bot * fy);
      }
      out[dst + 3] = 255;
    }
  }
  return out;
}

function insetBox(box: Box, frac: number, width: number, height: number): Box {
  const dx = Math.round(box.w * frac);
  const dy = Math.round(box.h * frac);
  const x = Math.max(0, box.x + dx);
  const y = Math.max(0, box.y + dy);
  return {
    x,
    y,
    w: Math.min(width - x, box.w - dx * 2),
    h: Math.min(height - y, box.h - dy * 2),
  };
}

function sampledMedian(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

/**
 * Broad median luminance of the detected bright surface. A real sheet may be
 * shaded or drawn over, but a dim tabletop must not be accepted as paper.
 */
function estimatePaperSurfaceLuminance(
  lum: Uint8Array,
  width: number,
  box: Box,
  threshold: number,
): number {
  const values: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt((box.w * box.h) / 8000)));
  for (let y = box.y; y < box.y + box.h; y += stride) {
    for (let x = box.x; x < box.x + box.w; x += stride) {
      const value = lum[y * width + x];
      if (value >= threshold) values.push(value);
    }
  }
  return values.length > 0 ? sampledMedian(values) : 0;
}

function isNearFullFramePaper(box: Box, width: number, height: number): boolean {
  const tolerance = Math.max(PAPER_GRID * 2, Math.round(Math.min(width, height) * 0.02));
  const touches = [
    box.x <= tolerance,
    box.y <= tolerance,
    box.x + box.w >= width - tolerance,
    box.y + box.h >= height - tolerance,
  ].filter(Boolean).length;
  return touches >= 3 && box.w / width >= 0.9 && box.h / height >= 0.75;
}

/** Median RGB of bright neutral paper pixels inside the box, sampled on a stride. */
export function estimatePaperColor(
  rgba: Uint8Array,
  width: number,
  box: Box,
  lum: Uint8Array,
  threshold: number,
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const neutralRs: number[] = [];
  const neutralGs: number[] = [];
  const neutralBs: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt((box.w * box.h) / 8000)));
  for (let y = box.y; y < box.y + box.h; y += stride) {
    for (let x = box.x; x < box.x + box.w; x += stride) {
      const i = y * width + x;
      if (lum[i] < threshold) continue;
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      rs.push(r);
      gs.push(g);
      bs.push(b);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (
        lum[i] >= NEUTRAL_PAPER_MIN_LUMINANCE &&
        chroma <= NEUTRAL_PAPER_MAX_CHROMA
      ) {
        neutralRs.push(r);
        neutralGs.push(g);
        neutralBs.push(b);
      }
    }
  }
  if (rs.length === 0) return [245, 243, 238];
  const useNeutral = neutralRs.length >= MIN_NEUTRAL_PAPER_SAMPLES;
  return useNeutral
    ? [
        sampledMedian(neutralRs),
        sampledMedian(neutralGs),
        sampledMedian(neutralBs),
      ]
    : [sampledMedian(rs), sampledMedian(gs), sampledMedian(bs)];
}

function smoothstepByte(low: number, high: number, v: number): number {
  if (v <= low) return 0;
  if (v >= high) return 255;
  const t = (v - low) / (high - low);
  return Math.round(t * t * (3 - 2 * t) * 255);
}

/**
 * Main entry: extract the drawing from a photo.
 * Returns null when no paper or no ink is found.
 */
export function extractDrawing(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: CutoutOptions = {},
): CutoutResult | null {
  const inkLow = options.inkDistLow ?? 26;
  const inkHigh = options.inkDistHigh ?? 68;

  const lum = luminance(rgba, width, height);
  const paper = detectPaper(lum, width, height);
  if (!paper) return null;
  const detectedPaperBox = insetBox(
    paper.box,
    PAPER_INSET_FRAC,
    width,
    height,
  );
  if (
    detectedPaperBox.w < 8 ||
    detectedPaperBox.h < 8 ||
    estimatePaperSurfaceLuminance(
      lum,
      width,
      detectedPaperBox,
      paper.threshold,
    ) < MIN_PAPER_SURFACE_LUMINANCE
  ) {
    return null;
  }

  // A sheet photographed at an angle: rectify it first, then run the flat
  // pipeline on the warped image (whose own quad is axis-aligned, so the
  // recursion always terminates after one level).
  if (!options.disableDewarp) {
    const quad = paperQuad(paper);
    if (quadSkew(quad) > DEWARP_SKEW_MIN) {
      const size = rectifiedSize(quad);
      if (size.w >= 16 && size.h >= 16) {
        const flat = warpQuadToRect(rgba, width, height, quad, size.w, size.h);
        const inner = extractDrawing(flat, size.w, size.h, {
          ...options,
          disableDewarp: true,
        });
        if (inner) {
          // Map the rectified ink box back through the homography so the
          // caller can still place overlays in source coordinates.
          const m = squareToQuad(quad);
          const corners = [
            mapUnit(m, inner.inkBox.x / (size.w - 1), inner.inkBox.y / (size.h - 1)),
            mapUnit(m, (inner.inkBox.x + inner.inkBox.w) / (size.w - 1), inner.inkBox.y / (size.h - 1)),
            mapUnit(
              m,
              (inner.inkBox.x + inner.inkBox.w) / (size.w - 1),
              (inner.inkBox.y + inner.inkBox.h) / (size.h - 1),
            ),
            mapUnit(m, inner.inkBox.x / (size.w - 1), (inner.inkBox.y + inner.inkBox.h) / (size.h - 1)),
          ];
          const xs = corners.map((p) => p.x);
          const ys = corners.map((p) => p.y);
          const minX = Math.max(0, Math.round(Math.min(...xs)));
          const minY = Math.max(0, Math.round(Math.min(...ys)));
          const qxs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x];
          const qys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y];
          return {
            ...inner,
            paperBox: {
              x: Math.round(Math.min(...qxs)),
              y: Math.round(Math.min(...qys)),
              w: Math.round(Math.max(...qxs) - Math.min(...qxs)),
              h: Math.round(Math.max(...qys) - Math.min(...qys)),
            },
            inkBox: {
              x: minX,
              y: minY,
              w: Math.min(width - minX, Math.round(Math.max(...xs) - Math.min(...xs))),
              h: Math.min(height - minY, Math.round(Math.max(...ys) - Math.min(...ys))),
            },
          };
        }
      }
    }
  }

  const fullFramePaper = isNearFullFramePaper(paper.box, width, height);
  const paperBox = insetBox(
    fullFramePaper ? { x: 0, y: 0, w: width, h: height } : paper.box,
    fullFramePaper ? FULL_FRAME_INSET_FRAC : PAPER_INSET_FRAC,
    width,
    height,
  );
  if (paperBox.w < 8 || paperBox.h < 8) return null;

  const [pr, pg, pb] = estimatePaperColor(rgba, width, paperBox, lum, paper.threshold);

  // Ink alpha inside the paper box, clipped to the actual paper region so a
  // tilted sheet doesn't leak table pixels in through its bbox corners
  const bw = paperBox.w;
  const bh = paperBox.h;
  const alpha = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const srcY = paperBox.y + y;
    const gridRow = Math.min(paper.gridH - 1, (srcY / PAPER_GRID) | 0) * paper.gridW;
    const srcRow = srcY * width + paperBox.x;
    for (let x = 0; x < bw; x++) {
      const gx = Math.min(paper.gridW - 1, ((paperBox.x + x) / PAPER_GRID) | 0);
      if (!fullFramePaper && !paper.grid[gridRow + gx]) continue;
      const p = (srcRow + x) * 4;
      const dr = rgba[p] - pr;
      const dg = rgba[p + 1] - pg;
      const db = rgba[p + 2] - pb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      alpha[y * bw + x] = smoothstepByte(inkLow, inkHigh, dist);
    }
  }

  despeckle(alpha, bw, bh);

  // Ink bounding box
  let minX = bw;
  let minY = bh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (alpha[y * bw + x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const pad = Math.round(Math.max(bw, bh) * INK_PAD_FRAC);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(bw - 1, maxX + pad);
  maxY = Math.min(bh - 1, maxY + pad);

  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const ax = minX + x;
      const ay = minY + y;
      const src = ((paperBox.y + ay) * width + paperBox.x + ax) * 4;
      const dst = (y * outW + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = alpha[ay * bw + ax];
    }
  }

  return {
    pixels: out,
    width: outW,
    height: outH,
    paperBox,
    inkBox: { x: paperBox.x + minX, y: paperBox.y + minY, w: outW, h: outH },
  };
}

/**
 * Remove small isolated alpha blobs (dust, paper grain, soft shadow haze).
 * Works on a SPECK_GRID-downscaled binary mask; keeps alpha only within one
 * cell of a surviving component.
 */
export function despeckle(alpha: Uint8Array, w: number, h: number): void {
  const gw = Math.max(1, Math.ceil(w / SPECK_GRID));
  const gh = Math.max(1, Math.ceil(h / SPECK_GRID));
  const solid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] >= 96) {
        solid[((y / SPECK_GRID) | 0) * gw + ((x / SPECK_GRID) | 0)] = 1;
      }
    }
  }

  const labels = new Int32Array(gw * gh).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(gw * gh);
  let nextLabel = 0;
  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = nextLabel;
    let size = 0;
    while (head < tail) {
      const idx = queue[head++];
      size++;
      const x = idx % gw;
      const y = (idx / gw) | 0;
      // 8-connected so diagonal stroke joins survive
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (solid[n] && labels[n] === -1) {
            labels[n] = nextLabel;
            queue[tail++] = n;
          }
        }
      }
    }
    sizes.push(size);
    nextLabel++;
  }

  // Keep this permissive: real strokes (sun rays, whiskers) can be as small
  // as a few dozen cells at photo resolution, while dust is only 1-2 cells.
  const minKeep = Math.max(8, Math.round(gw * gh * 0.0002));
  const kept = new Uint8Array(gw * gh);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] >= 0 && sizes[labels[i]] >= minKeep) kept[i] = 1;
  }

  // Dilate kept mask by one cell, then zero alpha outside it
  const dilated = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!kept[y * gw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          dilated[ny * gw + nx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dilated[((y / SPECK_GRID) | 0) * gw + ((x / SPECK_GRID) | 0)]) {
        alpha[y * w + x] = 0;
      }
    }
  }
}
