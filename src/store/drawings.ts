import { File } from "expo-file-system";
import { create } from "zustand";

import type { ProcessedCutout } from "@/utils/imageio";
import { enqueueLibrarySnapshot, loadLibrarySnapshot } from "@/database";
import { getPadDesign, type PadDesignId } from "@/pad-designs";
import { canCreateContent, type ContentCounts } from "@/subscription/access";
import { currentCapabilities, useMembership } from "@/store/membership";
import {
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
  hydrate: () => Promise<void>;
  reloadForAccount: () => Promise<void>;
  resetForAccountSwitch: () => void;
  setPending: (cutout: ProcessedCutout) => void;
  /** Land the pending cutout in the active pad and persist it. */
  commitPending: () => boolean;
  clearPending: () => void;
  /** Wipe the active pad's drawings (long-press on the camera button). */
  clearActivePad: () => void;
  createPad: (
    name: string,
    style: PadStyle,
    design: PadDesignId,
    pageColor?: string,
    childId?: string,
  ) => string | null;
  setPadDesign: (id: string, design: PadDesignId) => void;
  renamePad: (id: string, name: string) => void;
  /** Deletes the pad and its drawings from disk. No-op on the last pad. */
  deletePad: (id: string) => void;
  setActivePad: (id: string) => void;
  setActiveChild: (childId: string) => void;
  removeChildContent: (childId: string) => void;
}

const EMPTY_DRAWINGS: Drawing[] = [];

export function contentCountsOf(s: {
  pads: Sketchpad[];
  drawingsByPad: Record<string, Drawing[]>;
}): ContentCounts {
  return {
    children: 1,
    sketchpads: s.pads.length,
    artworks: Object.values(s.drawingsByPad).reduce((total, drawings) => total + drawings.length, 0),
  };
}

export function activeDrawingsOf(s: {
  drawingsByPad: Record<string, Drawing[]>;
  activePadId: string;
}): Drawing[] {
  return s.drawingsByPad[s.activePadId] ?? EMPTY_DRAWINGS;
}

export function activePadOf(s: { pads: Sketchpad[]; activePadId: string }): Sketchpad | undefined {
  return s.pads.find((p) => p.id === s.activePadId);
}

function persist(s: { activePadId: string; pads: Sketchpad[]; drawingsByPad: Record<string, Drawing[]> }): void {
  const data: StoreData = {
    version: 3,
    activePadId: s.activePadId,
    pads: s.pads,
    drawingsByPad: s.drawingsByPad,
  };
  enqueueLibrarySnapshot(data);
}

function deleteDrawingFiles(drawings: Drawing[]): void {
  for (const d of drawings) {
    for (const uri of [d.uri, d.photoUri]) {
      if (!uri) continue;
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {}
    }
  }
}

export const useDrawings = create<DrawingsState>((set, get) => ({
  hydrated: false,
  pads: [],
  activePadId: "",
  drawingsByPad: {},
  pending: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const data = await loadLibrarySnapshot();
      set({
        hydrated: true,
        pads: data.pads,
        activePadId: data.activePadId,
        drawingsByPad: data.drawingsByPad,
      });
    } catch (error) {
      console.warn("Failed to hydrate Buki library", error);
      const data = migrateStoreData(null, Date.now());
      set({
        hydrated: true,
        pads: data.pads,
        activePadId: data.activePadId,
        drawingsByPad: data.drawingsByPad,
      });
    }
  },

  reloadForAccount: async () => {
    const data = await loadLibrarySnapshot();
    set({
      hydrated: true,
      pads: data.pads,
      activePadId: data.activePadId,
      drawingsByPad: data.drawingsByPad,
      pending: null,
    });
  },

  resetForAccountSwitch: () =>
    set({ hydrated: false, pads: [], activePadId: "", drawingsByPad: {}, pending: null }),

  setPending: (cutout) => {
    set({
      pending: { ...cutout, rotation: (Math.random() - 0.5) * 10 },
    });
  },

  commitPending: () => {
    const { pending, drawingsByPad, activePadId, pads } = get();
    if (!pending) return false;
    const current = drawingsByPad[activePadId] ?? [];
    if (current.some((d) => d.uri === pending.uri)) {
      set({ pending: null });
      return true;
    }
    if (!canCreateContent("artworks", contentCountsOf({ pads, drawingsByPad }), currentCapabilities())) {
      useMembership.getState().requestUpgrade("artworks", "artwork_limit");
      return false;
    }
    const drawing: Drawing = {
      id: `d-${pending.uri.split("/").pop() ?? Date.now()}`,
      uri: pending.uri,
      width: pending.width,
      height: pending.height,
      rotation: pending.rotation,
      addedAt: Date.now(),
      photoUri: pending.photoUri,
    };
    const nextByPad = { ...drawingsByPad, [activePadId]: [...current, drawing] };
    set({ drawingsByPad: nextByPad, pending: null });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  clearPending: () => set({ pending: null }),

  clearActivePad: () => {
    const { drawingsByPad, activePadId, pads } = get();
    deleteDrawingFiles(drawingsByPad[activePadId] ?? []);
    const nextByPad = { ...drawingsByPad, [activePadId]: [] };
    set({ drawingsByPad: nextByPad, pending: null });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
  },

  createPad: (name, style, design, pageColor, childId) => {
    const { pads, drawingsByPad } = get();
    if (!canCreateContent("sketchpads", contentCountsOf({ pads, drawingsByPad }), currentCapabilities())) {
      useMembership.getState().requestUpgrade("sketchpads", "sketchpad_limit");
      return null;
    }
    if (!childId) return null;
    const pad = makePad(name, style, design, Date.now(), undefined, pageColor, childId);
    const nextPads = [...pads, pad];
    const nextByPad = { ...drawingsByPad, [pad.id]: [] };
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: pad.id });
    persist({ activePadId: pad.id, pads: nextPads, drawingsByPad: nextByPad });
    return pad.id;
  },

  setPadDesign: (id, design) => {
    const { pads, drawingsByPad, activePadId } = get();
    const palette = getPadDesign(design);
    const nextPads = pads.map((pad) =>
      pad.id === id
        ? {
            ...pad,
            design,
            coverColor: palette.cover,
            pageColor: palette.paper,
          }
        : pad,
    );
    set({ pads: nextPads });
    persist({ activePadId, pads: nextPads, drawingsByPad });
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
    const target = pads.find((pad) => pad.id === id);
    if (!target || pads.filter((pad) => pad.childId === target.childId).length <= 1) return;
    deleteDrawingFiles(drawingsByPad[id] ?? []);
    const nextPads = pads.filter((p) => p.id !== id);
    const nextByPad = { ...drawingsByPad };
    delete nextByPad[id];
    const nextActive = activePadId === id
      ? (nextPads.find((pad) => pad.childId === target.childId)?.id ?? nextPads[0].id)
      : activePadId;
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: nextActive });
    persist({ activePadId: nextActive, pads: nextPads, drawingsByPad: nextByPad });
  },

  setActivePad: (id) => {
    const { pads, drawingsByPad, activePadId } = get();
    if (id === activePadId || !pads.some((p) => p.id === id)) return;
    set({ activePadId: id, pending: null });
    persist({ activePadId: id, pads, drawingsByPad });
  },

  setActiveChild: (childId) => {
    const { pads, drawingsByPad, activePadId } = get();
    const nextPad = pads.find((pad) => pad.childId === childId);
    if (!nextPad || nextPad.id === activePadId) return;
    set({ activePadId: nextPad.id, pending: null });
    persist({ activePadId: nextPad.id, pads, drawingsByPad });
  },

  removeChildContent: (childId) => {
    const { pads, drawingsByPad, activePadId } = get();
    const removedPads = pads.filter((pad) => pad.childId === childId);
    for (const pad of removedPads) deleteDrawingFiles(drawingsByPad[pad.id] ?? []);
    const removedIds = new Set(removedPads.map((pad) => pad.id));
    const nextPads = pads.filter((pad) => !removedIds.has(pad.id));
    const nextByPad = { ...drawingsByPad };
    for (const id of removedIds) delete nextByPad[id];
    const nextActive = removedIds.has(activePadId) ? (nextPads[0]?.id ?? "") : activePadId;
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: nextActive, pending: null });
    if (nextActive) persist({ activePadId: nextActive, pads: nextPads, drawingsByPad: nextByPad });
  },
}));
