import * as Haptics from "expo-haptics";

import { usePreferences } from "@/store/preferences";

function enabled(): boolean {
  return usePreferences.getState().hapticsEnabled;
}

export function impactHaptic(style: Haptics.ImpactFeedbackStyle): void {
  if (!enabled()) return;
  Haptics.impactAsync(style).catch(() => {});
}

export function selectionHaptic(): void {
  if (!enabled()) return;
  Haptics.selectionAsync().catch(() => {});
}

export function notificationHaptic(type: Haptics.NotificationFeedbackType): void {
  if (!enabled()) return;
  Haptics.notificationAsync(type).catch(() => {});
}

export { Haptics };
