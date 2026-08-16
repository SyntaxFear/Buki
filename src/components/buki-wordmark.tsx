import { Text, type TextProps } from "react-native";

import { colors } from "@/theme";

interface BukiWordmarkProps extends Omit<TextProps, "children"> {
  fontSize?: number;
}

export function BukiWordmark({
  fontSize = 46,
  style,
  accessibilityLabel = "Buki",
  ...props
}: BukiWordmarkProps) {
  const lineHeight = Math.ceil(fontSize * 1.24);

  return (
    <Text
      {...props}
      accessibilityLabel={accessibilityLabel}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.82}
      maxFontSizeMultiplier={1.2}
      style={[
        {
          fontFamily: "PatrickHand",
          fontSize,
          lineHeight,
          width: Math.ceil(fontSize * 1.48),
          fontWeight: "400",
          flexShrink: 0,
        },
        style,
      ]}
    >
      <Text style={{ color: colors.titleCoral, fontFamily: "PatrickHand" }}>
        B
      </Text>
      <Text style={{ color: colors.titleTeal, fontFamily: "PatrickHand" }}>
        u
      </Text>
      <Text style={{ color: colors.titleYellow, fontFamily: "PatrickHand" }}>
        k
      </Text>
      <Text style={{ color: colors.titleBlue, fontFamily: "PatrickHand" }}>
        i
      </Text>
    </Text>
  );
}
