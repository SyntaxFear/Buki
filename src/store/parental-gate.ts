import { create } from "zustand";

interface Challenge {
  left: number;
  right: number;
  reason: string;
}

interface ParentalGateState {
  challenge: Challenge | null;
  resolve: ((confirmed: boolean) => void) | null;
  request: (reason: string) => Promise<boolean>;
  answer: (value: string) => boolean;
  cancel: () => void;
}

export const useParentalGate = create<ParentalGateState>((set, get) => ({
  challenge: null,
  resolve: null,

  request: (reason) => {
    get().resolve?.(false);
    const left = 4 + Math.floor(Math.random() * 6);
    const right = 3 + Math.floor(Math.random() * 7);
    return new Promise<boolean>((resolve) => {
      set({ challenge: { left, right, reason }, resolve });
    });
  },

  answer: (value) => {
    const { challenge, resolve } = get();
    if (!challenge || Number(value) !== challenge.left + challenge.right) return false;
    set({ challenge: null, resolve: null });
    resolve?.(true);
    return true;
  },

  cancel: () => {
    const resolve = get().resolve;
    set({ challenge: null, resolve: null });
    resolve?.(false);
  },
}));

export function confirmAdult(reason: string): Promise<boolean> {
  return useParentalGate.getState().request(reason);
}
