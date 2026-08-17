import {
  HapticProvider as TickleHapticProvider,
  createContinuousPlayer,
  destroyContinuousPlayer,
  setHapticsEnabled,
  startContinuousPlayer,
  stopAllHaptics,
  stopContinuousPlayer,
  triggerImpact,
  triggerNotification,
  triggerSelection,
  updateContinuousPlayer,
  type HapticImpactStyle,
  type HapticNotificationType,
} from "@renegades/react-native-tickle";
import { useEffect, type ReactNode } from "react";
import { scheduleOnUI } from "react-native-worklets";

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

const PAGE_TURN_PLAYER_ID = "buki-sketchpad-page-turn";
const TRANSIENT_DEBOUNCE_MS = 36;

let hapticsEnabled = true;
let lastTransientAt = 0;

function canPlayTransient(): boolean {
  const now = Date.now();
  if (now - lastTransientAt < TRANSIENT_DEBOUNCE_MS) return false;
  lastTransientAt = now;
  return true;
}

function playSelection(): void {
  if (!hapticsEnabled || !canPlayTransient()) return;
  scheduleOnUI(playSelectionOnUI);
}

function playImpactOnUI(style: HapticImpactStyle): void {
  "worklet";
  triggerImpact(style);
}

function playNotificationOnUI(type: HapticNotificationType): void {
  "worklet";
  triggerNotification(type);
}

function playSelectionOnUI(): void {
  "worklet";
  triggerSelection();
}

export function HapticProvider({ children }: { children: ReactNode }) {
  return <TickleHapticProvider>{children}</TickleHapticProvider>;
}

export function syncHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  if (!enabled) {
    stopContinuousPlayer(PAGE_TURN_PLAYER_ID);
    stopAllHaptics();
  }
  setHapticsEnabled(enabled);
}

export function impactHaptic(style: HapticImpactStyle): void {
  if (!hapticsEnabled || !canPlayTransient()) return;
  scheduleOnUI(playImpactOnUI, style);
}

export function selectionHaptic(): void {
  playSelection();
}

export function notificationHaptic(type: HapticNotificationType): void {
  if (!hapticsEnabled) return;
  lastTransientAt = Date.now();
  scheduleOnUI(playNotificationOnUI, type);
}

export function usePageTurnHaptics(): void {
  useEffect(() => {
    createContinuousPlayer(PAGE_TURN_PLAYER_ID, 1, 0.5);
    return () => {
      stopContinuousPlayer(PAGE_TURN_PLAYER_ID);
      destroyContinuousPlayer(PAGE_TURN_PLAYER_ID);
    };
  }, []);
}

export function startPageTurnHaptic(): void {
  "worklet";
  startContinuousPlayer(PAGE_TURN_PLAYER_ID);
}

export function stopPageTurnHaptic(): void {
  "worklet";
  stopContinuousPlayer(PAGE_TURN_PLAYER_ID);
}

export function updatePageTurnHaptic(
  intensity: number,
  sharpness: number,
): void {
  "worklet";
  updateContinuousPlayer(PAGE_TURN_PLAYER_ID, intensity, sharpness);
}

export function pageTurnCrestHaptic(): void {
  "worklet";
  triggerImpact("rigid");
}

export function pageTurnBoundaryHaptic(): void {
  "worklet";
  triggerImpact("soft");
}
