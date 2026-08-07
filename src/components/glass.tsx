import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

/** True when the OS renders native Liquid Glass (iOS 26+). */
export const liquidGlass = isLiquidGlassAvailable();

interface GlassProps extends ViewProps {
  /** Tint washed into the glass material */
  tint?: string;
  /**
   * Semi-transparent color layered over the glass for strong brand colors —
   * the tint alone reads as a faint wash.
   */
  overlayColor?: string;
  /** Solid background used on platforms without Liquid Glass */
  fallbackColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Liquid Glass surface following the documented pattern: the glass is a
 * non-interactive background layer inside a plain container, so wrapping
 * Pressables receive every touch. Pass the shape and content layout via
 * `style`. Never set opacity:0 on this or an ancestor — it disables the
 * native effect entirely.
 */
export function Glass({ tint, overlayColor, fallbackColor, style, children, ...rest }: GlassProps) {
  if (!liquidGlass) {
    return (
      <View
        style={[style, { backgroundColor: overlayColor ?? fallbackColor }, styles.clip]}
        {...rest}
      >
        {children}
      </View>
    );
  }
  return (
    <View style={[style, styles.clip]} {...rest}>
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        isInteractive={false}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {overlayColor ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});
