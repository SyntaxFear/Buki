import { create } from "zustand";

import { loadBooleanPreference, saveBooleanPreference } from "@/database";
import { syncHapticsEnabled } from "@/utils/haptics";

interface PreferencesState {
  hydrated: boolean;
  hapticsEnabled: boolean;
  proIntroductionShown: boolean;
  hydrate: () => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  markProIntroductionShown: () => Promise<void>;
  resetForAccountSwitch: () => void;
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  hydrated: false,
  hapticsEnabled: true,
  proIntroductionShown: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [hapticsEnabled, proIntroductionShown] = await Promise.all([
      loadBooleanPreference("haptics_enabled", true),
      loadBooleanPreference("pro_introduction_shown", false),
    ]);
    syncHapticsEnabled(hapticsEnabled);
    set({ hydrated: true, hapticsEnabled, proIntroductionShown });
  },

  setHapticsEnabled: async (enabled) => {
    syncHapticsEnabled(enabled);
    set({ hapticsEnabled: enabled });
    await saveBooleanPreference("haptics_enabled", enabled);
  },

  markProIntroductionShown: async () => {
    if (get().proIntroductionShown) return;
    set({ proIntroductionShown: true });
    await saveBooleanPreference("pro_introduction_shown", true);
  },

  resetForAccountSwitch: () => {
    syncHapticsEnabled(true);
    set({ hydrated: false, hapticsEnabled: true, proIntroductionShown: false });
  },
}));
