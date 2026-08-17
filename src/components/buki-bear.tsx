import { Image, type ImageProps } from "expo-image";

export const BUKI_BEAR_IMAGE = require("../../assets/images/buki-bear.png");

type BukiBearProps = Omit<ImageProps, "source">;

export function BukiBear({ contentFit = "contain", ...props }: BukiBearProps) {
  return (
    <Image
      {...props}
      source={BUKI_BEAR_IMAGE}
      contentFit={contentFit}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
