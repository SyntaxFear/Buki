// Pure store-shape types + migration, kept free of native imports so the
// logic is unit-testable with plain objects.

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
  name: string;
  style: PadStyle;
  coverColor: string;
  /** Page tint; older pads omit it and render the classic cream */
  pageColor?: string;
  createdAt: number;
}

export interface StoreData {
  version: 2;
  activePadId: string;
  pads: Sketchpad[];
  drawingsByPad: Record<string, Drawing[]>;
}

export const DEFAULT_PAD_NAME = "My Book";
export const DEFAULT_COVER = "#E8695A";
export const DEFAULT_PAGE = "#FDF8ED";

export function makePad(
  name: string,
  style: PadStyle,
  coverColor: string,
  now: number,
  id?: string,
  pageColor: string = DEFAULT_PAGE,
): Sketchpad {
  return {
    id: id ?? `pad-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || DEFAULT_PAD_NAME,
    style,
    coverColor,
    pageColor,
    createdAt: now,
  };
}

function emptyStore(now: number): StoreData {
  const pad = makePad(DEFAULT_PAD_NAME, "spread", DEFAULT_COVER, now, "pad-default");
  return { version: 2, activePadId: pad.id, pads: [pad], drawingsByPad: { [pad.id]: [] } };
}

function isDrawing(d: unknown): d is Drawing {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return typeof o.uri === "string" && typeof o.width === "number" && typeof o.height === "number";
}

/**
 * Accepts whatever JSON was on disk — v1 ({version:1, drawings}), v2, or
 * garbage — and returns a valid v2 store. v1 collections become a single
 * default spread pad so nothing is lost.
 */
export function migrateStoreData(raw: unknown, now: number): StoreData {
  if (typeof raw !== "object" || raw === null) return emptyStore(now);
  const o = raw as Record<string, unknown>;

  if (o.version === 2 && Array.isArray(o.pads) && typeof o.drawingsByPad === "object" && o.drawingsByPad !== null) {
    const pads = (o.pads as unknown[]).filter(
      (p): p is Sketchpad =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as Sketchpad).id === "string" &&
        typeof (p as Sketchpad).name === "string" &&
        PAD_STYLES.includes((p as Sketchpad).style),
    );
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
    return { version: 2, activePadId, pads, drawingsByPad: byPad };
  }

  // v1: a single flat drawing list
  if (Array.isArray(o.drawings)) {
    const store = emptyStore(now);
    store.drawingsByPad[store.activePadId] = (o.drawings as unknown[]).filter(isDrawing);
    return store;
  }

  return emptyStore(now);
}
