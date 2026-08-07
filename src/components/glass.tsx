import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

/**
 * `isLiquidGlassAvailable()` only reports whether the app opted into the
 * Liquid Glass design; the runtime rendering API can still be missing on
 * some iOS 26 builds (expo/expo#40911), which is what actually crashes or
 * silently fails to paint. `isGlassEffectAPIAvailable()` is the check the
 * docs say to gate GlassView/GlassContainer on.
 */
export const liquidGlass = isGlassEffectAPIAvailable();

interface GlassProps extends ViewProps {
  /**
   * Solid brand color passed straight through to GlassView's own
   * `tintColor`. The system blends it into the material — pass a real
   * opaque color, not a pre-diluted rgba(); stacking a manual translucent
   * wash on top double-applies transparency and flattens the glass.
   */
  tint?: string;
  /** Solid background used when the native glass API is unavailable */
  fallbackColor?: string;
  style?: StyleProp<ViewStyle>;
}

function borderRadiusOf(style: StyleProp<ViewStyle>): number | undefined {
  const flat = StyleSheet.flatten(style) ?? {};
  const r = flat.borderRadius;
  return typeof r === "number" ? r : undefined;
}

/**
 * Native Liquid Glass surface with a plain-color fallback pre-iOS 26. The
 * radius is read out of `style` and applied to the glass layer directly —
 * native compositor effects need their own corner mask, not just a
 * clipping parent — so round corners via `style.borderRadius` as usual.
 */
export function Glass({ tint, fallbackColor, style, children, ...rest }: GlassProps) {
  const radius = borderRadiusOf(style);

  if (!liquidGlass) {
    return (
      <View style={[style, fallbackColor ? { backgroundColor: fallbackColor } : undefined]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[style, styles.clip]} {...rest}>
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        isInteractive
        style={[StyleSheet.absoluteFill, radius !== undefined && { borderRadius: radius }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});
