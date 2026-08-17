import { Host } from "@expo/ui";
import { Circle, Image, ZStack } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHint,
  accessibilityIdentifier,
  accessibilityLabel,
  frame,
  foregroundStyle,
  glassEffect,
  onLongPressGesture,
  onTapGesture,
  strokeBorder,
} from "@expo/ui/swift-ui/modifiers";

import type { NativeCaptureButtonProps } from "@/components/native-capture-button";
import { colors } from "@/theme";
import {
  Haptics,
  impactHaptic,
  notificationHaptic,
} from "@/utils/haptics";

export function NativeCaptureButton({
  onPress,
  onLongPress,
  style,
}: NativeCaptureButtonProps) {
  const handlePress = () => {
    impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };
  const handleLongPress = () => {
    notificationHaptic(Haptics.NotificationFeedbackType.Warning);
    onLongPress();
  };

  return (
    <Host matchContents style={style} seedColor={colors.fab}>
      <ZStack
        modifiers={[
          frame({ width: 76, height: 76 }),
          glassEffect({
            glass: {
              variant: "regular",
              interactive: true,
              tint: colors.surface,
            },
            shape: "circle",
          }),
          strokeBorder({
            color: "rgba(255,118,94,0.22)",
            style: { lineWidth: 1 },
            shape: "circle",
          }),
          onTapGesture(handlePress),
          onLongPressGesture(handleLongPress, 0.5),
          accessibilityElement("combine"),
          accessibilityAddTraits(["isButton"]),
          accessibilityLabel("Scan a drawing"),
          accessibilityHint(
            "Opens the camera. Long-press to clear this sketchpad.",
          ),
          accessibilityIdentifier("home-capture-button"),
        ]}
      >
        <Circle
          modifiers={[
            frame({ width: 64, height: 64 }),
            foregroundStyle(colors.fab),
          ]}
        />
        <Image systemName="camera.fill" size={27} color={colors.page} />
      </ZStack>
    </Host>
  );
}
