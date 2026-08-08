import * as Crypto from "expo-crypto";
import { create } from "zustand";

import { getSupabaseClient } from "@/auth/supabase";
import {
  addBukiChild,
  editBukiChild,
  finishBukiOnboarding,
  loadBukiProfiles,
  selectBukiChild,
} from "@/database";
import { canCreateContent } from "@/subscription/access";
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
    const adultName = input.adultName.trim();
    const childName = input.childName.trim();
    if (!adultName || !childName) {
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
      const { error } = await getSupabaseClient().auth.updateUser({
        data: { full_name: adultName, avatar_url: input.adultAvatarUri },
      });
      if (error) throw error;
      await get().reloadForAccount();
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  createChild: async (input) => {
    const name = input.name.trim();
    if (!name) return null;
    const { children } = get();
    const allowed = canCreateContent(
      "children",
      { children: children.length, sketchpads: 0, artworks: 0 },
      currentCapabilities(),
    );
    if (!allowed) {
      useMembership.getState().requestUpgrade("children", "child_limit");
      return null;
    }
    set({ busy: true, error: null });
    try {
      const id = Crypto.randomUUID();
      await addBukiChild({
        id,
        name,
        avatarColor: input.avatarColor,
        avatarUri: input.avatarUri ?? null,
        birthMonth: input.birthMonth ?? null,
        birthYear: input.birthYear ?? null,
      });
      await get().reloadForAccount();
      return id;
    } catch (error) {
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
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
