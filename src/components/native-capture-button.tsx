import { SymbolView } from "expo-symbols";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { Glass } from "@/components/glass";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { colors } from "@/theme";

export interface NativeCaptureButtonProps {
  onPress: () => void;
  onLongPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Cross-platform fallback for the main capture action. iOS resolves the
 * sibling `.ios.tsx` implementation, which is a real SwiftUI Button with an
 * interactive Liquid Glass shell and the same visual measurements.
 */
export function NativeCaptureButton({
  onPress,
  onLongPress,
  style,
}: NativeCaptureButtonProps) {
  return (
    <Glass
      tint={colors.surface}
      fallbackColor={colors.surface}
      style={[styles.shell, style]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        haptic="medium"
        longPressHaptic="warning"
        accessibilityRole="button"
        accessibilityLabel="Scan a drawing"
        accessibilityHint="Opens the camera. Long-press to clear this sketchpad."
        testID="home-capture-button"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <SymbolView
          name="camera.fill"
          size={27}
          tintColor={colors.page}
        />
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: "rgba(255,118,94,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.fab,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    backgroundColor: colors.fabPressed,
    transform: [{ scale: 0.96 }],
  },
});
