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
import {
  normalizeArtworkTags,
  normalizeArtworkText,
} from "@/organization/artwork-organizer";
import {
  canCreateContent,
  isContentLimitReachedError,
  isProFeatureRequiredError,
  type ContentCounts,
} from "@/subscription/access";
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
  requestArtworkCreation: (source?: string) => boolean;
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
      style: PadStyle;
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

export function activeChildPadIdsOf(s: {
  pads: Sketchpad[];
  activePadId: string;
}): ReadonlySet<string> {
  const childId = s.pads.find((pad) => pad.id === s.activePadId)?.childId;
  if (!childId) return new Set();
  return new Set(s.pads.filter((pad) => pad.childId === childId).map((pad) => pad.id));
}

function persist(
  s: { activePadId: string; pads: Sketchpad[]; drawingsByPad: Record<string, Drawing[]> },
  onError?: (error: unknown) => void,
): void {
  const data: StoreData = {
    version: 5,
    activePadId: s.activePadId,
    pads: s.pads,
    drawingsByPad: s.drawingsByPad,
  };
  enqueueLibrarySnapshot(data, currentCapabilities, onError);
}

function deleteMediaFiles(items: { uri: string; photoUri?: string }[]): void {
  for (const item of items) {
    for (const uri of [item.uri, item.photoUri]) {
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
  allowedPadIds: ReadonlySet<string>,
  update: (drawing: Drawing) => Drawing,
): { drawingsByPad: Record<string, Drawing[]>; changed: boolean } {
  let changed = false;
  const nextByPad: Record<string, Drawing[]> = {};
  for (const [padId, drawings] of Object.entries(drawingsByPad)) {
    if (!allowedPadIds.has(padId)) {
      nextByPad[padId] = drawings;
      continue;
    }
    nextByPad[padId] = drawings.map((drawing) => {
      if (drawing.id !== id) return drawing;
      changed = true;
      return update(drawing);
    });
  }
  return { drawingsByPad: changed ? nextByPad : drawingsByPad, changed };
}

interface LocatedDrawing {
  padId: string;
  index: number;
  drawing: Drawing;
}

function drawingIndex(drawingsByPad: Record<string, Drawing[]>): Map<string, LocatedDrawing> {
  const index = new Map<string, LocatedDrawing>();
  for (const [padId, drawings] of Object.entries(drawingsByPad)) {
    drawings.forEach((drawing, drawingIndex) => {
      index.set(drawing.id, { padId, index: drawingIndex, drawing });
    });
  }
  return index;
}

function organizationTagKey(tags: readonly string[] | undefined): string {
  return normalizeArtworkTags(tags ?? [])
    .map(normalizeArtworkText)
    .sort()
    .join("\u0000");
}

function sameOrganization(left: Drawing, right: Drawing): boolean {
  return (
    (left.favorite === true) === (right.favorite === true) &&
    organizationTagKey(left.tags) === organizationTagKey(right.tags)
  );
}

export function rollbackRejectedAdvancedOrganization(
  current: Record<string, Drawing[]>,
  previous: Record<string, Drawing[]>,
  rejected: Record<string, Drawing[]>,
): Record<string, Drawing[]> {
  const previousIndex = drawingIndex(previous);
  const rejectedIndex = drawingIndex(rejected);
  const currentIndex = drawingIndex(current);
  const candidates: {
    id: string;
    previous: LocatedDrawing;
    current: LocatedDrawing;
    restored: Drawing;
  }[] = [];

  for (const [id, rejectedLocation] of rejectedIndex) {
    const previousLocation = previousIndex.get(id);
    const currentLocation = currentIndex.get(id);
    if (!previousLocation || !currentLocation) continue;
    const operationChangedOrganization =
      previousLocation.padId !== rejectedLocation.padId ||
      !sameOrganization(previousLocation.drawing, rejectedLocation.drawing);
    if (!operationChangedOrganization) continue;
    if (
      currentLocation.padId !== rejectedLocation.padId ||
      !sameOrganization(currentLocation.drawing, rejectedLocation.drawing)
    ) {
      continue;
    }

    const restored: Drawing = {
      ...currentLocation.drawing,
      favorite: previousLocation.drawing.favorite === true,
      tags: [...(previousLocation.drawing.tags ?? [])],
      updatedAt:
        currentLocation.drawing.updatedAt === rejectedLocation.drawing.updatedAt
          ? previousLocation.drawing.updatedAt
          : currentLocation.drawing.updatedAt,
    };
    candidates.push({
      id,
      previous: previousLocation,
      current: currentLocation,
      restored,
    });
  }

  if (candidates.length === 0) return current;

  const next = Object.fromEntries(
    Object.entries(current).map(([padId, drawings]) => [padId, [...drawings]]),
  );
  const movedIds = new Set(
    candidates
      .filter(({ previous: before, current: after }) => before.padId !== after.padId)
      .map(({ id }) => id),
  );

  for (const [padId, drawings] of Object.entries(next)) {
    next[padId] = drawings.filter((drawing) => !movedIds.has(drawing.id));
  }
  for (const candidate of candidates) {
    if (movedIds.has(candidate.id)) continue;
    const padDrawings = next[candidate.current.padId];
    const index = padDrawings?.findIndex((drawing) => drawing.id === candidate.id) ?? -1;
    if (index >= 0) padDrawings[index] = candidate.restored;
  }
  const movedCandidates = candidates
    .filter(({ id }) => movedIds.has(id))
    .sort((left, right) => {
      if (left.previous.padId !== right.previous.padId) {
        return left.previous.padId < right.previous.padId ? -1 : 1;
      }
      return left.previous.index - right.previous.index;
    });
  for (const candidate of movedCandidates) {
    const destination = next[candidate.previous.padId];
    if (!destination) continue;
    destination.splice(
      Math.min(candidate.previous.index, destination.length),
      0,
      candidate.restored,
    );
  }

  return next;
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

  requestArtworkCreation: (source = "artwork_limit") => {
    const { pads, drawingsByPad } = get();
    if (canCreateContent("artworks", contentCountsOf({ pads, drawingsByPad }), currentCapabilities())) {
      return true;
    }
    useMembership.getState().requestUpgrade("artworks", source);
    return false;
  },

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
    if (!get().requestArtworkCreation("artwork_limit")) {
      deleteMediaFiles([pending]);
      set({ pending: null });
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
    persist({ activePadId, pads, drawingsByPad: nextByPad }, (error) => {
      if (!isContentLimitReachedError(error, "artworks")) return;
      deleteMediaFiles([drawing]);
      set((state) => ({
        drawingsByPad: Object.fromEntries(
          Object.entries(state.drawingsByPad).map(([padId, drawings]) => [
            padId,
            drawings.filter((item) => item.id !== drawing.id),
          ]),
        ),
      }));
      useMembership.getState().requestUpgrade("artworks", "artwork_limit_commit");
    });
    if (isFirstArtwork) setTimeout(() => introduceProAfterFirstArtwork(), 700);
    return true;
  },

  clearPending: () => set({ pending: null }),

  clearActivePad: () => {
    const { drawingsByPad, activePadId, pads } = get();
    deleteMediaFiles(drawingsByPad[activePadId] ?? []);
    const nextByPad = { ...drawingsByPad, [activePadId]: [] };
    set({ drawingsByPad: nextByPad, pending: null });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
  },

  updateDrawingMetadata: (id, updates) => {
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    const now = Date.now();
    const result = updateDrawingById(drawingsByPad, id, allowedPadIds, (drawing) => ({
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
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    const result = updateDrawingById(drawingsByPad, id, allowedPadIds, (drawing) => ({
      ...drawing,
      favorite: !drawing.favorite,
      updatedAt: Date.now(),
    }));
    if (!result.changed) return false;
    set({ drawingsByPad: result.drawingsByPad });
    persist({ activePadId, pads, drawingsByPad: result.drawingsByPad }, (error) => {
      if (!isProFeatureRequiredError(error, "advancedOrganization")) return;
      set((state) => ({
        drawingsByPad: rollbackRejectedAdvancedOrganization(
          state.drawingsByPad,
          drawingsByPad,
          result.drawingsByPad,
        ),
      }));
      useMembership.getState().requestUpgrade(
        "advancedOrganization",
        "artwork_favorite_commit",
      );
    });
    return true;
  },

  setDrawingTags: (id, tags) => {
    if (!advancedOrganizationAllowed("artwork_tags")) return false;
    const normalizedTags = normalizeArtworkTags(tags);
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    const result = updateDrawingById(drawingsByPad, id, allowedPadIds, (drawing) => ({
      ...drawing,
      tags: normalizedTags,
      updatedAt: Date.now(),
    }));
    if (!result.changed) return false;
    set({ drawingsByPad: result.drawingsByPad });
    persist({ activePadId, pads, drawingsByPad: result.drawingsByPad }, (error) => {
      if (!isProFeatureRequiredError(error, "advancedOrganization")) return;
      set((state) => ({
        drawingsByPad: rollbackRejectedAdvancedOrganization(
          state.drawingsByPad,
          drawingsByPad,
          result.drawingsByPad,
        ),
      }));
      useMembership.getState().requestUpgrade(
        "advancedOrganization",
        "artwork_tags_commit",
      );
    });
    return true;
  },

  deleteDrawing: (id) => {
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    const removed: Drawing[] = [];
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        !allowedPadIds.has(padId)
          ? drawings
          : drawings.filter((drawing) => {
              if (drawing.id !== id) return true;
              removed.push(drawing);
              return false;
            }),
      ]),
    );
    if (removed.length === 0) return false;
    deleteMediaFiles(removed);
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  bulkSetFavorite: (ids, favorite) => {
    if (!advancedOrganizationAllowed("library_bulk_favorite")) return false;
    const selected = new Set(ids);
    if (selected.size === 0) return false;
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    let changed = false;
    const now = Date.now();
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        !allowedPadIds.has(padId)
          ? drawings
          : drawings.map((drawing) => {
              if (!selected.has(drawing.id) || drawing.favorite === favorite) return drawing;
              changed = true;
              return { ...drawing, favorite, updatedAt: now };
            }),
      ]),
    );
    if (!changed) return false;
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad }, (error) => {
      if (!isProFeatureRequiredError(error, "advancedOrganization")) return;
      set((state) => ({
        drawingsByPad: rollbackRejectedAdvancedOrganization(
          state.drawingsByPad,
          drawingsByPad,
          nextByPad,
        ),
      }));
      useMembership.getState().requestUpgrade(
        "advancedOrganization",
        "library_bulk_favorite_commit",
      );
    });
    return true;
  },

  bulkAddTag: (ids, tag) => {
    if (!advancedOrganizationAllowed("library_bulk_tag")) return false;
    const [normalizedTag] = normalizeArtworkTags([tag]);
    const selected = new Set(ids);
    if (!normalizedTag || selected.size === 0) return false;
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    let changed = false;
    const now = Date.now();
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        !allowedPadIds.has(padId)
          ? drawings
          : drawings.map((drawing) => {
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
    persist({ activePadId, pads, drawingsByPad: nextByPad }, (error) => {
      if (!isProFeatureRequiredError(error, "advancedOrganization")) return;
      set((state) => ({
        drawingsByPad: rollbackRejectedAdvancedOrganization(
          state.drawingsByPad,
          drawingsByPad,
          nextByPad,
        ),
      }));
      useMembership.getState().requestUpgrade(
        "advancedOrganization",
        "library_bulk_tag_commit",
      );
    });
    return true;
  },

  bulkMoveDrawings: (ids, targetPadId) => {
    if (!advancedOrganizationAllowed("library_bulk_move")) return false;
    const selected = new Set(ids);
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    const targetPad = pads.find((pad) => pad.id === targetPadId && allowedPadIds.has(pad.id));
    if (!targetPad || selected.size === 0) return false;
    const moved: Drawing[] = [];
    const nextByPad = { ...drawingsByPad };
    for (const pad of pads) {
      if (pad.id === targetPadId || !allowedPadIds.has(pad.id)) continue;
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
    persist({ activePadId, pads, drawingsByPad: nextByPad }, (error) => {
      if (!isProFeatureRequiredError(error, "advancedOrganization")) return;
      set((state) => ({
        drawingsByPad: rollbackRejectedAdvancedOrganization(
          state.drawingsByPad,
          drawingsByPad,
          nextByPad,
        ),
      }));
      useMembership.getState().requestUpgrade(
        "advancedOrganization",
        "library_bulk_move_commit",
      );
    });
    return true;
  },

  bulkDeleteDrawings: (ids) => {
    if (!advancedOrganizationAllowed("library_bulk_delete")) return false;
    const selected = new Set(ids);
    if (selected.size === 0) return false;
    const { drawingsByPad, activePadId, pads } = get();
    const allowedPadIds = activeChildPadIdsOf({ pads, activePadId });
    const removed: Drawing[] = [];
    const nextByPad = Object.fromEntries(
      Object.entries(drawingsByPad).map(([padId, drawings]) => [
        padId,
        !allowedPadIds.has(padId)
          ? drawings
          : drawings.filter((drawing) => {
              if (!selected.has(drawing.id)) return true;
              removed.push(drawing);
              return false;
            }),
      ]),
    );
    if (removed.length === 0) return false;
    deleteMediaFiles(removed);
    set({ drawingsByPad: nextByPad });
    persist({ activePadId, pads, drawingsByPad: nextByPad });
    return true;
  },

  createPad: (name, style, design, pageColor, childId, border = "none", decoration = "none") => {
    const { pads, drawingsByPad, activePadId: previousActivePadId } = get();
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
    persist({ activePadId: pad.id, pads: nextPads, drawingsByPad: nextByPad }, (error) => {
      if (!isContentLimitReachedError(error, "sketchpads")) return;
      set((state) => {
        const rollbackPads = state.pads.filter((item) => item.id !== pad.id);
        const rollbackDrawings = { ...state.drawingsByPad };
        delete rollbackDrawings[pad.id];
        return {
          pads: rollbackPads,
          drawingsByPad: rollbackDrawings,
          activePadId:
            state.activePadId === pad.id
              ? (rollbackPads.some((item) => item.id === previousActivePadId)
                  ? previousActivePadId
                  : (rollbackPads[0]?.id ?? ""))
              : state.activePadId,
        };
      });
      useMembership.getState().requestUpgrade("sketchpads", "sketchpad_limit_commit");
    });
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
            style: visuals.style,
            design: visuals.design,
            border: visuals.border,
            decoration: visuals.decoration,
            coverColor: palette.cover,
            pageColor: visuals.pageColor ?? palette.paper,
          }
        : pad,
    );
    set({ pads: nextPads });
    persist({ activePadId, pads: nextPads, drawingsByPad }, (error) => {
      if (!isProFeatureRequiredError(error, "premiumVisuals")) return;
      set((state) => ({
        pads: state.pads.map((pad) => {
          if (pad.id !== id) return pad;
          const matchesRejectedVisuals =
            pad.style === visuals.style &&
            pad.design === visuals.design &&
            pad.border === visuals.border &&
            pad.decoration === visuals.decoration &&
            pad.pageColor === (visuals.pageColor ?? palette.paper);
          return matchesRejectedVisuals
            ? {
                ...pad,
                style: current.style,
                design: current.design,
                border: current.border,
                decoration: current.decoration,
                coverColor: current.coverColor,
                pageColor: current.pageColor,
              }
            : pad;
        }),
      }));
      useMembership.getState().requestUpgrade("premiumVisuals", "premium_visual_save_commit");
    });
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
    deleteMediaFiles(drawingsByPad[id] ?? []);
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
    for (const pad of removedPads) deleteMediaFiles(drawingsByPad[pad.id] ?? []);
    const removedIds = new Set(removedPads.map((pad) => pad.id));
    const nextPads = pads.filter((pad) => !removedIds.has(pad.id));
    const nextByPad = { ...drawingsByPad };
    for (const id of removedIds) delete nextByPad[id];
    const nextActive = removedIds.has(activePadId) ? (nextPads[0]?.id ?? "") : activePadId;
    set({ pads: nextPads, drawingsByPad: nextByPad, activePadId: nextActive, pending: null });
    if (nextActive) persist({ activePadId: nextActive, pads: nextPads, drawingsByPad: nextByPad });
  },
}));
