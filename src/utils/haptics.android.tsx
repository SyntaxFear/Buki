import * as ExpoHaptics from "expo-haptics";
import { useEffect, type ReactNode } from "react";
import { scheduleOnRN } from "react-native-worklets";

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

export type HapticImpactStyle =
  (typeof Haptics.ImpactFeedbackStyle)[keyof typeof Haptics.ImpactFeedbackStyle];
export type HapticNotificationType =
  (typeof Haptics.NotificationFeedbackType)[keyof typeof Haptics.NotificationFeedbackType];

const TRANSIENT_DEBOUNCE_MS = 36;

let hapticsEnabled = true;
let lastTransientAt = 0;
let pageTurnActive = false;

function canPlayTransient(): boolean {
  const now = Date.now();
  if (now - lastTransientAt < TRANSIENT_DEBOUNCE_MS) return false;
  lastTransientAt = now;
  return true;
}

function playAndroidHaptic(type: ExpoHaptics.AndroidHaptics): void {
  if (!hapticsEnabled) return;
  void ExpoHaptics.performAndroidHapticsAsync(type).catch(() => undefined);
}

function androidImpact(style: HapticImpactStyle): ExpoHaptics.AndroidHaptics {
  switch (style) {
    case Haptics.ImpactFeedbackStyle.Heavy:
      return ExpoHaptics.AndroidHaptics.Long_Press;
    case Haptics.ImpactFeedbackStyle.Medium:
      return ExpoHaptics.AndroidHaptics.Context_Click;
    case Haptics.ImpactFeedbackStyle.Soft:
      return ExpoHaptics.AndroidHaptics.Segment_Tick;
    case Haptics.ImpactFeedbackStyle.Rigid:
    case Haptics.ImpactFeedbackStyle.Light:
    default:
      return ExpoHaptics.AndroidHaptics.Virtual_Key;
  }
}

function androidNotification(
  type: HapticNotificationType,
): ExpoHaptics.AndroidHaptics {
  switch (type) {
    case Haptics.NotificationFeedbackType.Success:
      return ExpoHaptics.AndroidHaptics.Confirm;
    case Haptics.NotificationFeedbackType.Error:
      return ExpoHaptics.AndroidHaptics.Reject;
    case Haptics.NotificationFeedbackType.Warning:
    default:
      return ExpoHaptics.AndroidHaptics.Context_Click;
  }
}

function beginAndroidPageTurn(): void {
  if (!hapticsEnabled || pageTurnActive) return;
  pageTurnActive = true;
  playAndroidHaptic(ExpoHaptics.AndroidHaptics.Gesture_Start);
}

function endAndroidPageTurn(): void {
  if (!hapticsEnabled || !pageTurnActive) return;
  pageTurnActive = false;
  playAndroidHaptic(ExpoHaptics.AndroidHaptics.Gesture_End);
}

function playAndroidPageTurnCrest(): void {
  if (!pageTurnActive) return;
  playAndroidHaptic(ExpoHaptics.AndroidHaptics.Segment_Tick);
}

function playAndroidPageTurnBoundary(): void {
  playAndroidHaptic(ExpoHaptics.AndroidHaptics.Reject);
}

export function HapticProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function syncHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  if (!enabled) pageTurnActive = false;
}

export function impactHaptic(style: HapticImpactStyle): void {
  if (!hapticsEnabled || !canPlayTransient()) return;
  playAndroidHaptic(androidImpact(style));
}

export function selectionHaptic(): void {
  if (!hapticsEnabled || !canPlayTransient()) return;
  playAndroidHaptic(ExpoHaptics.AndroidHaptics.Segment_Tick);
}

export function notificationHaptic(type: HapticNotificationType): void {
  if (!hapticsEnabled) return;
  lastTransientAt = Date.now();
  playAndroidHaptic(androidNotification(type));
}

export function usePageTurnHaptics(): void {
  useEffect(
    () => () => {
      pageTurnActive = false;
    },
    [],
  );
}

export function startPageTurnHaptic(): void {
  "worklet";
  scheduleOnRN(beginAndroidPageTurn);
}

export function stopPageTurnHaptic(): void {
  "worklet";
  scheduleOnRN(endAndroidPageTurn);
}

export function updatePageTurnHaptic(
  _intensity: number,
  _sharpness: number,
): void {
  "worklet";
}

export function pageTurnCrestHaptic(): void {
  "worklet";
  scheduleOnRN(playAndroidPageTurnCrest);
}

export function pageTurnBoundaryHaptic(): void {
  "worklet";
  scheduleOnRN(playAndroidPageTurnBoundary);
}
