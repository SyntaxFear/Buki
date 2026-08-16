import type { ReactNode } from "react";

export const Haptics = {
  ImpactFeedbackStyle: {
    Rigid: "rigid",
    Heavy: "heavy",
    Medium: "medium",
    Light: "light",
    Soft: "soft",
  },
  NotificationFeedbackType: {
    Error: "error",
    Success: "success",
    Warning: "warning",
  },
} as const;

type ValueOf<T> = T[keyof T];
export type HapticImpactStyle = ValueOf<typeof Haptics.ImpactFeedbackStyle>;
export type HapticNotificationType = ValueOf<
  typeof Haptics.NotificationFeedbackType
>;

export function HapticProvider({ children }: { children: ReactNode }) {
  return children;
}

export function syncHapticsEnabled(_enabled: boolean): void {}

export function impactHaptic(_style: HapticImpactStyle): void {}

export function selectionHaptic(): void {}

export function notificationHaptic(_type: HapticNotificationType): void {}

export function usePageTurnHaptics(): void {}

export function startPageTurnHaptic(): void {
  "worklet";
}

export function stopPageTurnHaptic(): void {
  "worklet";
}

export function updatePageTurnHaptic(
  _intensity: number,
  _sharpness: number,
): void {
  "worklet";
}

export function pageTurnCrestHaptic(): void {
  "worklet";
}

export function pageTurnBoundaryHaptic(): void {
  "worklet";
}
