import * as Crypto from "expo-crypto";
import { create } from "zustand";

import { getSupabaseClient } from "@/auth/supabase";
import {
  addBukiChild,
  editBukiChild,
  finishBukiOnboarding,
  loadBukiProfiles,
  removeBukiChild,
  reorderBukiChildren,
  replayBukiOnboarding,
  selectBukiChild,
} from "@/database";
import { canCreateContent, isContentLimitReachedError } from "@/subscription/access";
import { useDrawings } from "@/store/drawings";
import { currentCapabilities, useMembership } from "@/store/membership";
import type { LocalChildProfile } from "@/database/profile-repository";

export type ChildProfile = LocalChildProfile;

interface ProfilesState {
  hydrated: boolean;
  busy: boolean;
  ownerId: string | null;
  children: ChildProfile[];
  activeChildId: string | null;
  onboardingComplete: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  reloadForAccount: () => Promise<void>;
  resetForAccountSwitch: () => void;
  completeOnboarding: (input: {
    adultName: string;
    adultAvatarUri: string | null;
    childName: string;
    childAvatarColor: string;
  }) => Promise<boolean>;
  createChild: (input: {
    name: string;
    avatarColor: string;
    avatarUri?: string | null;
    birthMonth?: number | null;
    birthYear?: number | null;
  }) => Promise<string | null>;
  updateChild: (
    childId: string,
    updates: Partial<Pick<ChildProfile, "name" | "avatarColor" | "avatarUri" | "birthMonth" | "birthYear">>,
  ) => Promise<boolean>;
  setActiveChild: (childId: string) => Promise<boolean>;
  moveChild: (childId: string, direction: -1 | 1) => Promise<boolean>;
  deleteChild: (childId: string) => Promise<boolean>;
  replayOnboarding: () => Promise<void>;
  clearError: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Could not update the Buki profile.";
}

async function readState() {
  return loadBukiProfiles();
}

export const useProfiles = create<ProfilesState>((set, get) => ({
  hydrated: false,
  busy: false,
  ownerId: null,
  children: [],
  activeChildId: null,
  onboardingComplete: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return;
    await get().reloadForAccount();
  },

  reloadForAccount: async () => {
    try {
      const state = await readState();
      set({ ...state, hydrated: true, error: null });
    } catch (error) {
      set({ hydrated: true, error: message(error) });
    }
  },

  resetForAccountSwitch: () =>
    set({
      hydrated: false,
      busy: false,
      ownerId: null,
      children: [],
      activeChildId: null,
      onboardingComplete: false,
      error: null,
    }),

  completeOnboarding: async (input) => {
    const ownerId = get().ownerId;
    const adultName = input.adultName.trim();
    const childName = input.childName.trim();
    if (!ownerId || !adultName || !childName) {
      set({ error: "Add both your name and your child’s name." });
      return false;
    }
    set({ busy: true, error: null });
    try {
      await finishBukiOnboarding({
        adultName,
        adultAvatarUri: input.adultAvatarUri,
        childId: Crypto.randomUUID(),
        childName,
        childAvatarColor: input.childAvatarColor,
        defaultPadId: Crypto.randomUUID(),
      });
      if (get().ownerId !== ownerId) return false;
      const session = await getSupabaseClient().auth.getSession();
      if (session.data.session?.user.id !== ownerId || get().ownerId !== ownerId) return false;
      const { error } = await getSupabaseClient().auth.updateUser({
        data: { full_name: adultName, avatar_url: input.adultAvatarUri },
      });
      if (error) console.warn("Could not update remote Buki profile metadata", error);
      if (get().ownerId !== ownerId) return false;
      await useDrawings.getState().reloadForAccount();
      if (get().ownerId !== ownerId) return false;
      await get().reloadForAccount();
      return get().ownerId === ownerId;
    } catch (error) {
      if (get().ownerId === ownerId) set({ error: message(error) });
      return false;
    } finally {
      if (get().ownerId === ownerId) set({ busy: false });
    }
  },

  createChild: async (input) => {
    const name = input.name.trim();
    if (!name) return null;
    const { children } = get();
    const capabilities = currentCapabilities();
    const pads = useDrawings.getState().pads;
    const counts = { children: children.length, sketchpads: pads.length, artworks: 0 };
    const childAllowed = canCreateContent(
      "children",
      counts,
      capabilities,
    );
    if (!childAllowed) {
      useMembership.getState().requestUpgrade("children", "child_limit");
      return null;
    }
    if (!canCreateContent("sketchpads", counts, capabilities)) {
      useMembership.getState().requestUpgrade("sketchpads", "sketchpad_limit");
      return null;
    }
    set({ busy: true, error: null });
    try {
      const id = Crypto.randomUUID();
      await addBukiChild(
        {
          id,
          name,
          avatarColor: input.avatarColor,
          avatarUri: input.avatarUri ?? null,
          birthMonth: input.birthMonth ?? null,
          birthYear: input.birthYear ?? null,
        },
        Crypto.randomUUID(),
        {
          maxChildren: capabilities.maxChildren,
          maxSketchpads: capabilities.maxSketchpads,
        },
      );
      await useDrawings.getState().reloadForAccount();
      await get().reloadForAccount();
      return id;
    } catch (error) {
      if (isContentLimitReachedError(error)) {
        useMembership
          .getState()
          .requestUpgrade(
            error.resource,
            error.resource === "children" ? "child_limit" : "sketchpad_limit",
          );
        await useDrawings.getState().reloadForAccount();
        await get().reloadForAccount();
        return null;
      }
      set({ error: message(error) });
      return null;
    } finally {
      set({ busy: false });
    }
  },

  updateChild: async (childId, updates) => {
    set({ busy: true, error: null });
    try {
      await editBukiChild(childId, updates);
      await get().reloadForAccount();
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  setActiveChild: async (childId) => {
    if (!get().children.some((child) => child.id === childId)) return false;
    try {
      await selectBukiChild(childId);
      set({ activeChildId: childId });
      useDrawings.getState().setActiveChild(childId);
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  moveChild: async (childId, direction) => {
    const children = [...get().children];
    const index = children.findIndex((child) => child.id === childId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= children.length) return false;
    [children[index], children[target]] = [children[target], children[index]];
    try {
      await reorderBukiChildren(children.map((child) => child.id));
      await get().reloadForAccount();
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  deleteChild: async (childId) => {
    try {
      await removeBukiChild(childId);
      useDrawings.getState().removeChildContent(childId);
      await get().reloadForAccount();
      const nextActive = get().activeChildId;
      if (nextActive) useDrawings.getState().setActiveChild(nextActive);
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  replayOnboarding: async () => {
    set({ busy: true, error: null });
    try {
      await replayBukiOnboarding();
      set({ onboardingComplete: false });
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),
}));
