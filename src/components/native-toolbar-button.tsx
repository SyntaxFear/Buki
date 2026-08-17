import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Glass } from "@/components/glass";
import { colors } from "@/theme";
import {
  Haptics,
  impactHaptic,
  notificationHaptic,
} from "@/utils/haptics";

export type NativeToolbarButtonVariant = "glass" | "prominent" | "destructive";
export type NativeToolbarButtonSize = "compact" | "regular" | "large";

export interface NativeToolbarButtonProps {
  label: string;
  icon?: SymbolViewProps["name"];
  title?: string;
  hint?: string;
  onPress: () => void;
  variant?: NativeToolbarButtonVariant;
  size?: NativeToolbarButtonSize;
  disabled?: boolean;
  tintColor?: string;
  foregroundColor?: string;
  fallbackColor?: string;
  haptic?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function defaultTint(variant: NativeToolbarButtonVariant): string {
  if (variant === "prominent") return colors.titleTeal;
  if (variant === "destructive") return "#9F352E";
  return colors.surfaceAlt;
}

function defaultForeground(variant: NativeToolbarButtonVariant): string {
  return variant === "glass" ? colors.titleTeal : "#FFFFFF";
}

function defaultFallback(variant: NativeToolbarButtonVariant): string {
  if (variant === "prominent") return colors.titleTeal;
  if (variant === "destructive") return "#9F352E";
  return colors.surfaceAlt;
}

/**
 * Cross-platform fallback for app-chrome controls. iOS resolves the sibling
 * `.ios.tsx` implementation, which is a real SwiftUI Button with the system
 * glass button style. Other platforms keep the same dimensions, SF Symbol,
 * accessibility contract, and restrained press response.
 */
export function NativeToolbarButton({
  label,
  icon,
  title,
  hint,
  onPress,
  variant = "glass",
  size = "regular",
  disabled = false,
  tintColor = defaultTint(variant),
  foregroundColor = defaultForeground(variant),
  fallbackColor = defaultFallback(variant),
  haptic = true,
  testID,
  style,
}: NativeToolbarButtonProps) {
  const compact = size === "compact";
  const large = size === "large";
  const iconOnly = Boolean(icon && !title);

  const handlePress = () => {
    if (haptic) {
      if (variant === "destructive") {
        notificationHaptic(Haptics.NotificationFeedbackType.Warning);
      } else {
        impactHaptic(
          variant === "prominent"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );
      }
    }
    onPress();
  };

  return (
    <Glass
      tint={tintColor}
      fallbackColor={fallbackColor}
      style={[
        styles.base,
        compact ? styles.compact : large ? styles.large : styles.regular,
        iconOnly
          ? compact
            ? styles.compactCircle
            : large
              ? styles.largeCircle
              : styles.regularCircle
          : styles.capsule,
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ disabled }}
        hitSlop={4}
        testID={testID}
        style={({ pressed }) => [
          iconOnly ? StyleSheet.absoluteFill : styles.labelContent,
          styles.content,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        {icon ? (
          <SymbolView
            name={icon}
            size={compact ? 15 : large ? 21 : 17}
            weight="semibold"
            tintColor={foregroundColor}
          />
        ) : null}
        {title ? (
          <Text
            numberOfLines={1}
            style={[styles.title, { color: foregroundColor }]}
          >
            {title}
          </Text>
        ) : null}
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  base: {
    flexShrink: 0,
    overflow: "hidden",
  },
  compact: {
    minWidth: 36,
    height: 36,
  },
  regular: {
    minWidth: 44,
    height: 44,
  },
  large: {
    minWidth: 52,
    height: 52,
  },
  compactCircle: {
    width: 36,
    borderRadius: 18,
  },
  regularCircle: {
    width: 44,
    borderRadius: 22,
  },
  largeCircle: {
    width: 52,
    borderRadius: 26,
  },
  capsule: {
    borderRadius: 999,
  },
  labelContent: {
    height: "100%",
    paddingHorizontal: 15,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.42,
  },
});
