import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

/** True when the OS renders native Liquid Glass (iOS 26+). */
export const liquidGlass = isLiquidGlassAvailable();

interface GlassProps extends ViewProps {
  /** Tint applied to the glass material */
  tint?: string;
  /** Solid background used on platforms without Liquid Glass */
  fallbackColor?: string;
  /** Let the glass react to touches (shimmer/press response) */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Native Liquid Glass surface with a plain-color fallback. Pass the shape
 * (borderRadius, padding, size) via `style`; never set a backgroundColor on
 * the glass path — it would cover the material.
 */
export function Glass({ tint, fallbackColor, interactive, style, children, ...rest }: GlassProps) {
  if (liquidGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        isInteractive={interactive ?? false}
        style={[style, { overflow: "hidden" }]}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[style, fallbackColor ? { backgroundColor: fallbackColor } : undefined]}
      {...rest}
    >
      {children}
    </View>
  );
}
