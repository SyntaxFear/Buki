import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
} from "react-native";

import {
  Haptics,
  impactHaptic,
  notificationHaptic,
  selectionHaptic,
  type HapticImpactStyle,
  type HapticNotificationType,
} from "@/utils/haptics";

export type PressHaptic =
  | HapticImpactStyle
  | HapticNotificationType
  | "selection"
  | false;

export interface HapticPressableProps extends PressableProps {
  haptic?: PressHaptic;
  longPressHaptic?: PressHaptic;
}

function playPressHaptic(feedback: PressHaptic): void {
  if (!feedback) return;
  if (feedback === "selection") {
    selectionHaptic();
    return;
  }
  if (
    feedback === Haptics.NotificationFeedbackType.Success ||
    feedback === Haptics.NotificationFeedbackType.Warning ||
    feedback === Haptics.NotificationFeedbackType.Error
  ) {
    notificationHaptic(feedback);
    return;
  }
  impactHaptic(feedback);
}

export function HapticPressable({
  haptic = Haptics.ImpactFeedbackStyle.Light,
  longPressHaptic = Haptics.ImpactFeedbackStyle.Medium,
  onPress,
  onLongPress,
  ...props
}: HapticPressableProps) {
  const handlePress = onPress
    ? (event: GestureResponderEvent) => {
        playPressHaptic(haptic);
        onPress(event);
      }
    : undefined;
  const handleLongPress = onLongPress
    ? (event: GestureResponderEvent) => {
        playPressHaptic(longPressHaptic);
        onLongPress(event);
      }
    : undefined;

  return (
    <Pressable
      {...props}
      onPress={handlePress}
      onLongPress={handleLongPress}
    />
  );
}
