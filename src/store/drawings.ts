import { File, Paths } from "expo-file-system";
import { create } from "zustand";

import type { ProcessedCutout } from "@/utils/imageio";

export interface Drawing {
  id: string;
  uri: string;
  width: number;
  height: number;
  /** small random tilt applied on the page, degrees */
  rotation: number;
  addedAt: number;
}

/** A freshly scanned cutout travelling from the scan screen to the book. */
export interface PendingDrawing extends ProcessedCutout {
  rotation: number;
}

interface DrawingsState {
  hydrated: boolean;
  drawings: Drawing[];
  pending: PendingDrawing | null;
  hydrate: () => void;
  setPending: (cutout: ProcessedCutout) => void;
  /** Land the pending cutout in the book and persist it. */
  commitPending: () => void;
  clearPending: () => void;
  /** Wipe the whole book (long-press on the camera button). */
  clearAll: () => void;
}

function indexFile(): File {
  return new File(Paths.document, "buki.json");
}

/** Pre-rebrand index file; migrated on first hydrate after the Buki update. */
function legacyIndexFile(): File {
  return new File(Paths.document, "bloombook.json");
}

function persist(drawings: Drawing[]): void {
  try {
    indexFile().write(JSON.stringify({ version: 1, drawings }));
  } catch (e) {
    console.warn("Failed to persist drawings", e);
  }
}

export const useDrawings = create<DrawingsState>((set, get) => ({
  hydrated: false,
  drawings: [],
  pending: null,

  hydrate: () => {
    if (get().hydrated) return;
    let drawings: Drawing[] = [];
    let migrated = false;
    try {
      let file = indexFile();
      if (!file.exists && legacyIndexFile().exists) {
        file = legacyIndexFile();
        migrated = true;
      }
      if (file.exists) {
        const parsed = JSON.parse(file.textSync()) as { drawings?: Drawing[] };
        drawings = (parsed.drawings ?? []).filter((d) => {
          try {
            return new File(d.uri).exists;
          } catch {
            return false;
          }
        });
      }
    } catch (e) {
      console.warn("Failed to hydrate drawings", e);
    }
    set({ drawings, hydrated: true });
    if (migrated) {
      persist(drawings);
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
    const { pending, drawings } = get();
    if (!pending) return;
    if (drawings.some((d) => d.uri === pending.uri)) {
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
    const next = [...drawings, drawing];
    set({ drawings: next, pending: null });
    persist(next);
  },

  clearPending: () => set({ pending: null }),

  clearAll: () => {
    for (const d of get().drawings) {
      try {
        const f = new File(d.uri);
        if (f.exists) f.delete();
      } catch {}
    }
    set({ drawings: [], pending: null });
    persist([]);
  },
}));
