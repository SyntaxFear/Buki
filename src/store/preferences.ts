import { create } from "zustand";

import { loadBooleanPreference, saveBooleanPreference } from "@/database";

interface PreferencesState {
  hydrated: boolean;
  hapticsEnabled: boolean;
  hydrate: () => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  resetForAccountSwitch: () => void;
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  hydrated: false,
  hapticsEnabled: true,

  hydrate: async () => {
    if (get().hydrated) return;
    const hapticsEnabled = await loadBooleanPreference("haptics_enabled", true);
    set({ hydrated: true, hapticsEnabled });
  },

  setHapticsEnabled: async (enabled) => {
    set({ hapticsEnabled: enabled });
    await saveBooleanPreference("haptics_enabled", enabled);
  },

  resetForAccountSwitch: () => set({ hydrated: false, hapticsEnabled: true }),
}));
