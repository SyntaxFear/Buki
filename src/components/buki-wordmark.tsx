import { Children, type ReactNode } from "react";
import {
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from "react-native";

import { colors } from "@/theme";

interface BukiWordmarkProps extends Omit<TextProps, "children"> {
  fontSize?: number;
}

interface BukiTextProps extends TextProps {
  brandBuki?: boolean;
  brandWeight?: TextStyle["fontWeight"];
  brandWholeText?: boolean;
  colorizeBuki?: boolean;
  minimumBrandFontSize?: number;
}

export interface BukiTextSegment {
  brandFont: boolean;
  branded: boolean;
  text: string;
}

const BUKI_PATTERN = /(\bBuki\b)/gi;

export function bukiTextSegments(value: string): BukiTextSegment[] {
  const parts = value
    .split(BUKI_PATTERN)
    .filter(Boolean);
  const brandFont = parts.some((text) => text.toLocaleLowerCase() === "buki");
  return parts.map((text) => ({
    brandFont,
    branded: text.toLocaleLowerCase() === "buki",
    text,
  }));
}

function InlineBukiWordmark({
  style,
  colorized,
  sourceText = "Buki",
}: {
  style?: TextStyle;
  colorized: boolean;
  sourceText?: string;
}) {
  if (!colorized) {
    return <NativeText style={style}>{sourceText}</NativeText>;
  }
  return (
    <NativeText style={[{ fontFamily: "PatrickHand", fontWeight: "400" }, style]}>
      <NativeText style={{ color: colors.titleCoral, fontFamily: "PatrickHand" }}>
        B
      </NativeText>
      <NativeText style={{ color: colors.titleTeal, fontFamily: "PatrickHand" }}>
        u
      </NativeText>
      <NativeText style={{ color: colors.titleYellow, fontFamily: "PatrickHand" }}>
        k
      </NativeText>
      <NativeText style={{ color: colors.titleBlue, fontFamily: "PatrickHand" }}>
        i
      </NativeText>
    </NativeText>
  );
}

function transformBukiChildren(
  children: ReactNode,
  brandTextStyle: TextStyle,
  colorizeBuki: boolean,
  brandWholeText: boolean,
): ReactNode {
  return Children.map(children, (child, childIndex) => {
    if (typeof child !== "string") return child;
    return bukiTextSegments(child).map((segment, segmentIndex) =>
      segment.branded ? (
        <InlineBukiWordmark
          key={`${childIndex}-${segmentIndex}`}
          style={brandTextStyle}
          colorized={colorizeBuki}
          sourceText={segment.text}
        />
      ) : segment.brandFont || brandWholeText ? (
        <NativeText
          key={`${childIndex}-${segmentIndex}`}
          style={brandTextStyle}
        >
          {segment.text}
        </NativeText>
      ) : (
        segment.text
      ),
    );
  });
}

function directText(children: ReactNode): string | null {
  let value = "";
  let supported = true;
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      value += String(child);
    } else if (child !== null && child !== undefined && typeof child !== "boolean") {
      supported = false;
    }
  });
  return supported ? value : null;
}

/**
 * Drop-in React Native Text that renders every visible Buki mention with the
 * canonical Patrick Hand, four-color wordmark while preserving the surrounding
 * type scale, layout, and accessibility wording.
 */
export function BukiText({
  children,
  accessibilityLabel,
  style,
  brandBuki = false,
  colorizeBuki = true,
  brandWholeText = false,
  brandWeight = "400",
  minimumBrandFontSize = 14,
  ...props
}: BukiTextProps) {
  const plainText = directText(children);
  const hasBuki = brandBuki && plainText ? /\bBuki\b/i.test(plainText) : false;
  const flattenedStyle = StyleSheet.flatten(style);
  const fontSize = Math.max(
    typeof flattenedStyle?.fontSize === "number" ? flattenedStyle.fontSize : 14,
    minimumBrandFontSize,
  );
  const lineHeight = Math.max(
    typeof flattenedStyle?.lineHeight === "number" ? flattenedStyle.lineHeight : 0,
    Math.ceil(fontSize * 1.15),
  );
  const brandTextStyle: TextStyle = {
    fontFamily: "PatrickHand",
    fontSize,
    lineHeight,
    fontWeight: brandWeight,
  };

  return (
    <NativeText
      {...props}
      style={style}
      accessibilityLabel={accessibilityLabel ?? (hasBuki ? plainText ?? undefined : undefined)}
    >
      {brandBuki || brandWholeText
        ? transformBukiChildren(
            children,
            brandTextStyle,
            brandBuki && colorizeBuki,
            brandWholeText,
          )
        : children}
    </NativeText>
  );
}

export function BukiWordmark({
  fontSize = 46,
  style,
  accessibilityLabel = "Buki",
  ...props
}: BukiWordmarkProps) {
  const lineHeight = Math.ceil(fontSize * 1.24);

  return (
    <NativeText
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
      <InlineBukiWordmark colorized />
    </NativeText>
  );
}
