import * as LocalAuthentication from "expo-local-authentication";
import { create } from "zustand";

interface AdultConfirmation {
  reason: string;
}

interface ParentalGateState {
  confirmation: AdultConfirmation | null;
  resolve: ((confirmed: boolean) => void) | null;
  busy: boolean;
  error: string | null;
  request: (reason: string) => Promise<boolean>;
  confirm: () => Promise<boolean>;
  cancel: () => void;
}

function authenticationError(error: string): string {
  if (error === "not_available" || error === "not_enrolled" || error === "passcode_not_set") {
    return "Set up Face ID, Touch ID, or a device passcode in Settings before using protected Buki actions.";
  }
  if (error === "lockout") {
    return "Device authentication is temporarily locked. Unlock the device with its passcode, then try again.";
  }
  if (error === "user_cancel" || error === "system_cancel" || error === "app_cancel") {
    return "Adult confirmation was canceled.";
  }
  return "Buki could not confirm the device owner. Please try again.";
}

export const useParentalGate = create<ParentalGateState>((set, get) => ({
  confirmation: null,
  resolve: null,
  busy: false,
  error: null,

  request: (reason) => {
    get().resolve?.(false);
    return new Promise<boolean>((resolve) => {
      set({ confirmation: { reason }, resolve, busy: false, error: null });
    });
  },

  confirm: async () => {
    const { confirmation, resolve, busy } = get();
    if (!confirmation || busy) return false;
    set({ busy: true, error: null });
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm you’re an adult",
        fallbackLabel: "Use Device Passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (get().confirmation !== confirmation || get().resolve !== resolve) return false;
      if (!result.success) {
        set({ busy: false, error: authenticationError(result.error) });
        return false;
      }
      set({ confirmation: null, resolve: null, busy: false, error: null });
      resolve?.(true);
      return true;
    } catch {
      if (get().confirmation !== confirmation || get().resolve !== resolve) return false;
      set({ busy: false, error: "Buki could not start device-owner authentication." });
      return false;
    }
  },

  cancel: () => {
    const { resolve, busy } = get();
    if (busy) return;
    set({ confirmation: null, resolve: null, busy: false, error: null });
    resolve?.(false);
  },
}));

export function confirmAdult(reason: string): Promise<boolean> {
  return useParentalGate.getState().request(reason);
}
