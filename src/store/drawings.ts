import { File, Paths } from "expo-file-system";
import { create } from "zustand";

import type { ProcessedCutout } from "@/utils/imageio";
import {
  DEFAULT_COVER,
  makePad,
  migrateStoreData,
  type Drawing,
  type PadStyle,
  type Sketchpad,
  type StoreData,
} from "./migrate";

export type { Drawing, PadStyle, Sketchpad } from "./migrate";

/** A freshly scanned cutout travelling from the scan screen to the book. */
export interface PendingDrawing extends ProcessedCutout {
  rotation: number;
}

interface DrawingsState {
  hydrated: boolean;
  pads: Sketchpad[];
  activePadId: string;
  drawingsByPad: Record<string, Drawing[]>;
  pending: PendingDrawing | null;
  hydrate: () => void;
  setPending: (cutout: ProcessedCutout) => void;
  /** Land the pending cutout in the active pad and persist it. */
  commitPending: () => void;
  clearPending: () => void;
  /** Wipe the active pad's drawings (long-press on the camera button). */
  clearActivePad: () => void;
  createPad: (name: string, style: PadStyle, coverColor: string) => string;
  renamePad: (id: string, name: string) => void;
  /** Deletes the pad and its drawings from disk. No-op on the last pad. */
  deletePad: (id: string) => void;
  setActivePad: (id: string) => void;
}

const EMPTY_DRAWINGS: Drawing[] = [];

export function activeDrawingsOf(s: {
  drawingsByPad: Record<string, Drawing[]>;
  activePadId: string;
}): Drawing[] {
  return s.drawingsByPad[s.activePadId] ?? EMPTY_DRAWINGS;
}

export function activePadOf(s: { pads: Sketchpad[]; activePadId: string }): Sketchpad | undefined {
  return s.pads.find((p) => p.id === s.activePadId);
}

function indexFile(): File {
  return new File(Paths.document, "buki.json");
}

/** Pre-rebrand index file; migrated on first hydrate after the Buki update. */
function legacyIndexFile(): File {
  return new File(Paths.document, "bloombook.json");
}

function persist(s: { activePadId: string; pads: Sketchpad[]; drawingsByPad: Record<string, Drawing[]> }): void {
  const data: StoreData = {
    version: 2,
    activePadId: s.activePadId,
    pads: s.pads,
    drawingsByPad: s.drawingsByPad,
  };
  try {
    indexFile().write(JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to persist sketchpads", e);
  }
}

function deleteDrawingFiles(drawings: Drawing[]): void {
  for (const d of drawings) {
    try {
      const f = new File(d.uri);
      if (f.exists) f.delete();
    } catch {}
  }
}

export const useDrawings = create<DrawingsState>((set, get) => ({
  hydrated: false,
  pads: [],
  activePadId: "",
  drawingsByPad: {},
  pending: null,

  hydrate: () => {
    if (get().hydrated) return;
    let raw: unknown = null;
    let sourceWasLegacy = false;
    try {
      let file = indexFile();
      if (!file.exists && legacyIndexFile().exists) {
        file = legacyIndexFile();
        sourceWasLegacy = true;
      }
      if (file.exists) raw = JSON.parse(file.textSync());
    } catch (e) {
      console.warn("Failed to read sketchpads", e);
    }

    const data = migrateStoreData(raw, Date.now());
    // Drop index entries whose PNG vanished from disk
    for (const pad of data.pads) {
      data.drawingsByPad[pad.id] = (data.drawingsByPad[pad.id] ?? []).filter((d) => {
        try {
          return new File(d.uri).exists;
        } catch {
          return false;
        }
      });
    }

    set({
      hydrated: true,
      pads: data.pads,
      activePadId: data.activePadId,
      drawingsByPad: data.drawingsByPad,
    });
    persist(data);
    if (sourceWasLegacy) {
      try {
        legacyIndexFile().delete();
      } catch {}
    }
  },

  setPending: (cutout) => {
    set({
      pending: { ...cutout, rotation: (Math.random() - 0.5) * 10 },
    });
  },

  commitPending: () => {
    const { pending, drawingsByPad, activePadId, pads } = get();
    if (!pending) return;
    const current = drawingsByPad[activePadId] ?? [];
    if (current.some((d) => d.uri === pending.uri)) {
      set({ pending: null });
      return;
    }
    const drawing: Drawing = {
      id: `d-${pending.uri.split("/").pop() ?? Date.now()}`,
      uri: pending.uri,
      width: pending.width,
      height: pending.height,
      rotation: pending.rotation,
      addedAt: Date.now(),
    };
    const nextByPad = { ...drawingsByPad, [activePadId]: [...current, drawing] };
    set({ drawingsByPad: nextByPad, pending: null });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
  },

  clearPending: () => set({ pending: null }),

  clearActivePad: () => {
    const { drawingsByPad, activePadId, pads } = get();
    deleteDrawingFiles(drawingsByPad[activePadId] ?? []);
    const nextByPad = { ...drawingsByPad, [activePadId]: [] };
    set({ drawingsByPad: nextByPad, pending: null });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
  },

  createPad: (name, style, coverColor) => {
    const { pads, drawingsByPad } = get();
    const pad = makePad(name, style, coverColor || DEFAULT_COVER, Date.now());
    const nextPads = [...pads, pad];
    const nextByPad = { ...drawingsByPad, [pad.id]: [] };
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: pad.id });
    persist({ activePadId: pad.id, pads: nextPads, drawingsByPad: nextByPad });
    return pad.id;
  },

  renamePad: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { pads, drawingsByPad, activePadId } = get();
    const nextPads = pads.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
    set({ pads: nextPads });
    persist({ activePadId, pads: nextPads, drawingsByPad });
  },

  deletePad: (id) => {
    const { pads, drawingsByPad, activePadId } = get();
    if (pads.length <= 1) return;
    deleteDrawingFiles(drawingsByPad[id] ?? []);
    const nextPads = pads.filter((p) => p.id !== id);
    const nextByPad = { ...drawingsByPad };
    delete nextByPad[id];
    const nextActive = activePadId === id ? nextPads[0].id : activePadId;
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: nextActive });
    persist({ activePadId: nextActive, pads: nextPads, drawingsByPad: nextByPad });
  },

  setActivePad: (id) => {
    const { pads, drawingsByPad, activePadId } = get();
    if (id === activePadId || !pads.some((p) => p.id === id)) return;
    set({ activePadId: id, pending: null });
    persist({ activePadId: id, pads, drawingsByPad });
  },
}));
