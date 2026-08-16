import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Glass } from "@/components/glass";
import { selectionHaptic } from "@/utils/haptics";

export type DrawingViewerMode = "drawing" | "photo";

export interface NativeDrawingModePickerProps {
  value: DrawingViewerMode;
  onChange: (value: DrawingViewerMode) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Cross-platform fallback. iOS resolves the sibling `.ios.tsx` file, which
 * renders a real SwiftUI segmented Picker with interactive Liquid Glass.
 */
export function NativeDrawingModePicker({
  value,
  onChange,
  style,
}: NativeDrawingModePickerProps) {
  return (
    <Glass fallbackColor="rgba(245,242,237,0.16)" style={[styles.pill, style]}>
      {(
        [
          { key: "drawing", label: "Drawing" },
          { key: "photo", label: "Photo" },
        ] as const
      ).map((option) => (
        <Pressable
          key={option.key}
          onPress={() => {
            if (value === option.key) return;
            selectionHaptic();
            onChange(option.key);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Show ${option.label.toLowerCase()}`}
          accessibilityState={{ selected: value === option.key }}
          style={[styles.option, value === option.key && styles.optionSelected]}
        >
          <Text
            style={[styles.label, value === option.key && styles.labelSelected]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    borderRadius: 22,
    padding: 4,
    gap: 4,
  },
  option: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
  },
  optionSelected: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  label: {
    color: "rgba(245,242,237,0.75)",
    fontSize: 14.5,
    fontWeight: "600",
  },
  labelSelected: {
    color: "#1E1A16",
    fontWeight: "700",
  },
});
