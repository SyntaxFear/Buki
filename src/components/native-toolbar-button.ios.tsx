import { Host } from "@expo/ui";
import { Button, Image } from "@expo/ui/swift-ui";
import type { SFSymbol } from "expo-symbols";
import {
  accessibilityHint,
  accessibilityIdentifier,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  imageScale,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { liquidGlass } from "@/components/glass";
import type {
  NativeToolbarButtonProps,
  NativeToolbarButtonVariant,
} from "@/components/native-toolbar-button";
import { colors } from "@/theme";
import {
  Haptics,
  impactHaptic,
  notificationHaptic,
} from "@/utils/haptics";

function defaultTint(variant: NativeToolbarButtonVariant): string {
  if (variant === "prominent") return colors.titleTeal;
  if (variant === "destructive") return "#9F352E";
  return colors.titleTeal;
}

function defaultForeground(variant: NativeToolbarButtonVariant): string {
  return variant === "glass" ? colors.titleTeal : "#FFFFFF";
}

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
  haptic = true,
  testID,
  style,
}: NativeToolbarButtonProps) {
  const iconOnly = Boolean(icon && !title);
  const compact = size === "compact";
  const large = size === "large";
  const prominent = variant !== "glass";
  const iconSize = compact ? 15 : large ? 21 : 17;
  const systemImage: SFSymbol | undefined =
    typeof icon === "string" ? icon : icon?.ios;
  const nativeStyle = liquidGlass
    ? prominent
      ? "glassProminent"
      : "glass"
    : prominent
      ? "borderedProminent"
      : "bordered";

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

  const modifiers = [
    buttonStyle(nativeStyle),
    buttonBorderShape(iconOnly ? "circle" : "capsule"),
    controlSize(compact ? "small" : large ? "large" : "regular"),
    tint(tintColor),
    foregroundStyle(foregroundColor),
    disabledModifier(disabled),
    accessibilityLabel(label),
    ...(hint ? [accessibilityHint(hint)] : []),
    ...(testID ? [accessibilityIdentifier(testID)] : []),
  ];

  return (
    <Host matchContents style={style} seedColor={tintColor}>
      {iconOnly && systemImage ? (
        <Button
          role={variant === "destructive" ? "destructive" : "default"}
          onPress={handlePress}
          modifiers={modifiers}
        >
          <Image
            systemName={systemImage}
            size={iconSize}
            color={foregroundColor}
            modifiers={[frame({ width: iconSize, height: iconSize })]}
          />
        </Button>
      ) : (
        <Button
          label={title ?? label}
          systemImage={systemImage}
          role={variant === "destructive" ? "destructive" : "default"}
          onPress={handlePress}
          modifiers={[
            ...modifiers,
            ...(systemImage
              ? [labelStyle("titleAndIcon"), imageScale("medium")]
              : []),
          ]}
        />
      )}
    </Host>
  );
}
