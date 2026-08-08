import { File } from "expo-file-system";
import { create } from "zustand";

import type { ProcessedCutout } from "@/utils/imageio";
import { enqueueLibrarySnapshot, loadLibrarySnapshot } from "@/database";
import { getPadDesign, isPremiumPadDesign, type PadDesignId } from "@/pad-designs";
import {
  hasPremiumPadVisual,
  isPremiumPadBorder,
  isPremiumPadDecoration,
  type PadBorderId,
  type PadDecorationId,
} from "@/pad-visuals";
import { normalizeArtworkTags } from "@/organization/artwork-organizer";
import { canCreateContent, type ContentCounts } from "@/subscription/access";
import { currentCapabilities, useMembership } from "@/store/membership";
import { usePreferences } from "@/store/preferences";
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
  updateDrawingMetadata: (id: string, updates: { title: string; notes: string }) => boolean;
  toggleDrawingFavorite: (id: string) => boolean;
  setDrawingTags: (id: string, tags: string[]) => boolean;
  deleteDrawing: (id: string) => boolean;
  bulkSetFavorite: (ids: string[], favorite: boolean) => boolean;
  bulkAddTag: (ids: string[], tag: string) => boolean;
  bulkMoveDrawings: (ids: string[], targetPadId: string) => boolean;
  bulkDeleteDrawings: (ids: string[]) => boolean;
  createPad: (
    name: string,
    style: PadStyle,
    design: PadDesignId,
    pageColor?: string,
    childId?: string,
    border?: PadBorderId,
    decoration?: PadDecorationId,
  ) => string | null;
  setPadVisuals: (
    id: string,
    visuals: {
      design: PadDesignId;
      border: PadBorderId;
      decoration: PadDecorationId;
      pageColor?: string;
    },
  ) => boolean;
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
    version: 5,
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

function advancedOrganizationAllowed(source: string): boolean {
  if (currentCapabilities().advancedOrganization) return true;
  useMembership.getState().requestUpgrade("advancedOrganization", source);
  return false;
}

function updateDrawingById(
  drawingsByPad: Record<string, Drawing[]>,
  id: string,
  update: (drawing: Drawing) => Drawing,
): { drawingsByPad: Record<string, Drawing[]>; changed: boolean } {
  let changed = false;
  const nextByPad: Record<string, Drawing[]> = {};
  for (const [padId, drawings] of Object.entries(drawingsByPad)) {
    nextByPad[padId] = drawings.map((drawing) => {
      if (drawing.id !== id) return drawing;
      changed = true;
      return update(drawing);
    });
  }
  return { drawingsByPad: changed ? nextByPad : drawingsByPad, changed };
}

function introduceProAfterFirstArtwork(attempt = 0): void {
  const membership = useMembership.getState();
  if (!membership.ownerId) return;
  if (membership.loading && attempt < 5) {
    setTimeout(() => introduceProAfterFirstArtwork(attempt + 1), 1000);
    return;
  }
  if (membership.tier !== "free" || usePreferences.getState().proIntroductionShown) return;
  void usePreferences.getState().markProIntroductionShown().catch(() => {});
  membership.requestUpgrade("premiumVisuals", "first_artwork");
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
      favorite: false,
      tags: [],
      updatedAt: Date.now(),
    };
    const isFirstArtwork = Object.values(drawingsByPad).every((drawings) => drawings.length === 0);
    const nextByPad = { ...drawingsByPad, [activePadId]: [...current, drawing] };
    set({ drawingsByPad: nextByPad, pending: null });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    if (isFirstArtwork) setTimeout(() => introduceProAfterFirstArtwork(), 700);
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

  updateDrawingMetadata: (id, updates) => {
    const { drawingsByPad, activePadId, pads } = get();
    const now = Date.now();
    const result = updateDrawingById(drawingsByPad, id, (drawing) => ({
      ...drawing,
      title: updates.title.trim().slice(0, 100) || undefined,
      notes: updates.notes.trim().slice(0, 2_000) || undefined,
      updatedAt: now,
    }));
    if (!result.changed) return false;
    set({ drawingsByPad: result.drawingsByPad });
    persist({ activePadId, pads, drawingsByPad: result.drawingsByPad });
    return true;
  },

  toggleDrawingFavorite: (id) => {
    if (!advancedOrganizationAllowed("artwork_favorite")) return false;
    const { drawingsByPad, activePadId, pads } = get();
    const result = updateDrawingById(drawingsByPad, id, (drawing) => ({
      ...drawing,
      favorite: !drawing.favorite,
      updatedAt: Date.now(),
    }));
    if (!result.changed) return false;
    set({ drawingsByPad: result.drawingsByPad });
    persist({ activePadId, pads, drawingsByPad: result.drawingsByPad });
    return true;
  },

  setDrawingTags: (id, tags) => {
    if (!advancedOrganizationAllowed("artwork_tags")) return false;
    const normalizedTags = normalizeArtworkTags(tags);
    const { drawingsByPad, activePadId, pads } = get();
    const result = updateDrawingById(drawingsByPad, id, (drawing) => ({
      ...drawing,
      tags: normalizedTags,
      updatedAt: Date.now(),
    }));
    if (!result.changed) return false;
    set({ drawingsByPad: result.drawingsByPad });
    persist({ activePadId, pads, drawingsByPad: result.drawingsByPad });
    return true;
  },

  deleteDrawing: (id) => {
    const { drawingsByPad, activePadId, pads } = get();
    const removed: Drawing[] = [];
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        drawings.filter((drawing) => {
          if (drawing.id !== id) return true;
          removed.push(drawing);
          return false;
        }),
      ]),
    );
    if (removed.length === 0) return false;
    deleteDrawingFiles(removed);
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  bulkSetFavorite: (ids, favorite) => {
    if (!advancedOrganizationAllowed("library_bulk_favorite")) return false;
    const selected = new Set(ids);
    if (selected.size === 0) return false;
    const { drawingsByPad, activePadId, pads } = get();
    let changed = false;
    const now = Date.now();
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        drawings.map((drawing) => {
          if (!selected.has(drawing.id) || drawing.favorite === favorite) return drawing;
          changed = true;
          return { ...drawing, favorite, updatedAt: now };
        }),
      ]),
    );
    if (!changed) return false;
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  bulkAddTag: (ids, tag) => {
    if (!advancedOrganizationAllowed("library_bulk_tag")) return false;
    const [normalizedTag] = normalizeArtworkTags([tag]);
    const selected = new Set(ids);
    if (!normalizedTag || selected.size === 0) return false;
    const { drawingsByPad, activePadId, pads } = get();
    let changed = false;
    const now = Date.now();
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        drawings.map((drawing) => {
          if (!selected.has(drawing.id)) return drawing;
          const tags = normalizeArtworkTags([...(drawing.tags ?? []), normalizedTag]);
          if (tags.length === (drawing.tags ?? []).length) return drawing;
          changed = true;
          return { ...drawing, tags, updatedAt: now };
        }),
      ]),
    );
    if (!changed) return false;
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  bulkMoveDrawings: (ids, targetPadId) => {
    if (!advancedOrganizationAllowed("library_bulk_move")) return false;
    const selected = new Set(ids);
    const { drawingsByPad, activePadId, pads } = get();
    const targetPad = pads.find((pad) => pad.id === targetPadId);
    if (!targetPad || selected.size === 0) return false;
    const moved: Drawing[] = [];
    const nextByPad = { ...drawingsByPad };
    for (const pad of pads) {
      if (pad.id === targetPadId || pad.childId !== targetPad.childId) continue;
      const remaining: Drawing[] = [];
      for (const drawing of drawingsByPad[pad.id] ?? []) {
        if (selected.has(drawing.id)) moved.push({ ...drawing, updatedAt: Date.now() });
        else remaining.push(drawing);
      }
      nextByPad[pad.id] = remaining;
    }
    if (moved.length === 0) return false;
    nextByPad[targetPadId] = [...(drawingsByPad[targetPadId] ?? []), ...moved];
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  bulkDeleteDrawings: (ids) => {
    if (!advancedOrganizationAllowed("library_bulk_delete")) return false;
    const selected = new Set(ids);
    if (selected.size === 0) return false;
    const { drawingsByPad, activePadId, pads } = get();
    const removed: Drawing[] = [];
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        drawings.filter((drawing) => {
          if (!selected.has(drawing.id)) return true;
          removed.push(drawing);
          return false;
        }),
      ]),
    );
    if (removed.length === 0) return false;
    deleteDrawingFiles(removed);
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  createPad: (name, style, design, pageColor, childId, border = "none", decoration = "none") => {
    const { pads, drawingsByPad } = get();
    if (!canCreateContent("sketchpads", contentCountsOf({ pads, drawingsByPad }), currentCapabilities())) {
      useMembership.getState().requestUpgrade("sketchpads", "sketchpad_limit");
      return null;
    }
    if (!childId) return null;
    if (
      hasPremiumPadVisual({ design, border, decoration }) &&
      !currentCapabilities().premiumVisuals
    ) {
      useMembership.getState().requestUpgrade("premiumVisuals", "premium_visual_create");
      return null;
    }
    const pad = makePad(
      name,
      style,
      design,
      Date.now(),
      undefined,
      pageColor,
      childId,
      border,
      decoration,
    );
    const nextPads = [...pads, pad];
    const nextByPad = { ...drawingsByPad, [pad.id]: [] };
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: pad.id });
    persist({ activePadId: pad.id, pads: nextPads, drawingsByPad: nextByPad });
    return pad.id;
  },

  setPadVisuals: (id, visuals) => {
    const { pads, drawingsByPad, activePadId } = get();
    const current = pads.find((pad) => pad.id === id);
    if (!current) return false;
    const introducesPremium =
      (current.design !== visuals.design && isPremiumPadDesign(visuals.design)) ||
      (current.border !== visuals.border && isPremiumPadBorder(visuals.border)) ||
      (current.decoration !== visuals.decoration && isPremiumPadDecoration(visuals.decoration));
    if (introducesPremium && !currentCapabilities().premiumVisuals) {
      useMembership.getState().requestUpgrade("premiumVisuals", "premium_visual_save");
      return false;
    }
    const palette = getPadDesign(visuals.design);
    const nextPads = pads.map((pad) =>
      pad.id === id
        ? {
            ...pad,
            design: visuals.design,
            border: visuals.border,
            decoration: visuals.decoration,
            coverColor: palette.cover,
            pageColor: visuals.pageColor ?? palette.paper,
          }
        : pad,
    );
    set({ pads: nextPads });
    persist({ activePadId, pads: nextPads, drawingsByPad });
    return true;
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
