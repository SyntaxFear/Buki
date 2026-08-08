// Pure store-shape types + migration, kept free of native imports so the
// logic is unit-testable with plain objects.

import {
  DEFAULT_PAD_DESIGN_ID,
  getPadDesign,
  inferPadDesignId,
  isPadDesignId,
  type PadDesignId,
} from "@/pad-designs";
import { DEFAULT_CHILD_ID } from "@/database/constants";
import {
  isPadBorderId,
  isPadDecorationId,
  type PadBorderId,
  type PadDecorationId,
} from "@/pad-visuals";

export type PadStyle = "spread" | "vertical" | "album" | "grid" | "strip";

export const PAD_STYLES: readonly PadStyle[] = ["spread", "vertical", "album", "grid", "strip"];

export interface Drawing {
  id: string;
  uri: string;
  width: number;
  height: number;
  /** small random tilt applied on the page, degrees */
  rotation: number;
  addedAt: number;
  /** file:// URI of the original camera photo (absent on pre-photo scans) */
  photoUri?: string;
}

export interface Sketchpad {
  id: string;
  childId: string;
  name: string;
  style: PadStyle;
  design: PadDesignId;
  border: PadBorderId;
  decoration: PadDecorationId;
  coverColor: string;
  /** Page tint; older pads omit it and render the classic cream */
  pageColor?: string;
  createdAt: number;
}

export interface StoreData {
  version: 4;
  activePadId: string;
  pads: Sketchpad[];
  drawingsByPad: Record<string, Drawing[]>;
}

export const DEFAULT_PAD_NAME = "My Book";
export const DEFAULT_COVER = getPadDesign(DEFAULT_PAD_DESIGN_ID).cover;
export const DEFAULT_PAGE = getPadDesign(DEFAULT_PAD_DESIGN_ID).paper;

export function makePad(
  name: string,
  style: PadStyle,
  design: PadDesignId,
  now: number,
  id?: string,
  pageColor?: string,
  childId: string = DEFAULT_CHILD_ID,
  border: PadBorderId = "none",
  decoration: PadDecorationId = "none",
): Sketchpad {
  const palette = getPadDesign(design);
  return {
    id: id ?? `pad-${now}-${Math.random().toString(36).slice(2, 8)}`,
    childId,
    name: name.trim() || DEFAULT_PAD_NAME,
    style,
    design,
    border,
    decoration,
    coverColor: palette.cover,
    pageColor: pageColor ?? palette.paper,
    createdAt: now,
  };
}

function emptyStore(now: number): StoreData {
  const pad = makePad(DEFAULT_PAD_NAME, "spread", DEFAULT_PAD_DESIGN_ID, now, "pad-default");
  return { version: 4, activePadId: pad.id, pads: [pad], drawingsByPad: { [pad.id]: [] } };
}

function isDrawing(d: unknown): d is Drawing {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return typeof o.uri === "string" && typeof o.width === "number" && typeof o.height === "number";
}

/**
 * Accepts whatever JSON was on disk — v1 ({version:1, drawings}), v2/v3, or
 * garbage — and returns a valid v4 store. v1 collections become a single
 * default spread pad so nothing is lost.
 */
export function migrateStoreData(raw: unknown, now: number): StoreData {
  if (typeof raw !== "object" || raw === null) return emptyStore(now);
  const o = raw as Record<string, unknown>;

  if (
    (o.version === 2 || o.version === 3 || o.version === 4) &&
    Array.isArray(o.pads) &&
    typeof o.drawingsByPad === "object" &&
    o.drawingsByPad !== null
  ) {
    const pads = (o.pads as unknown[])
      .map(normalizePad)
      .filter((pad): pad is Sketchpad => pad !== null);
    if (pads.length === 0) return emptyStore(now);
    const byPad: Record<string, Drawing[]> = {};
    for (const pad of pads) {
      const list = (o.drawingsByPad as Record<string, unknown>)[pad.id];
      byPad[pad.id] = Array.isArray(list) ? list.filter(isDrawing) : [];
    }
    const activePadId =
      typeof o.activePadId === "string" && pads.some((p) => p.id === o.activePadId)
        ? o.activePadId
        : pads[0].id;
    return { version: 4, activePadId, pads, drawingsByPad: byPad };
  }

  // v1: a single flat drawing list
  if (Array.isArray(o.drawings)) {
    const store = emptyStore(now);
    store.drawingsByPad[store.activePadId] = (o.drawings as unknown[]).filter(isDrawing);
    return store;
  }

  return emptyStore(now);
}

function normalizePad(value: unknown): Sketchpad | null {
  if (typeof value !== "object" || value === null) return null;
  const pad = value as Record<string, unknown>;
  if (
    typeof pad.id !== "string" ||
    typeof pad.name !== "string" ||
    !PAD_STYLES.includes(pad.style as PadStyle)
  ) {
    return null;
  }

  const design = isPadDesignId(pad.design)
    ? pad.design
    : inferPadDesignId(typeof pad.coverColor === "string" ? pad.coverColor : undefined);
  const palette = getPadDesign(design);

  return {
    id: pad.id,
    childId: typeof pad.childId === "string" ? pad.childId : DEFAULT_CHILD_ID,
    name: pad.name,
    style: pad.style as PadStyle,
    design,
    border: isPadBorderId(pad.border) ? pad.border : "none",
    decoration: isPadDecorationId(pad.decoration) ? pad.decoration : "none",
    coverColor: typeof pad.coverColor === "string" ? pad.coverColor : palette.cover,
    pageColor: typeof pad.pageColor === "string" ? pad.pageColor : palette.paper,
    createdAt: typeof pad.createdAt === "number" ? pad.createdAt : 0,
  };
}
