import type { AndroidSymbol, SFSymbol } from "expo-symbols";

export type PadIconId =
  | "cover"
  | "book"
  | "star"
  | "heart"
  | "palette"
  | "camera"
  | "paw"
  | "rocket";

export interface PadIconOption {
  id: PadIconId;
  name: string;
  symbol: {
    ios: SFSymbol;
    android: AndroidSymbol;
    web: AndroidSymbol;
  };
}

export const DEFAULT_PAD_ICON_ID: PadIconId = "cover";

export const PAD_ICONS: readonly PadIconOption[] = [
  {
    id: "cover",
    name: "Cover",
    symbol: { ios: "books.vertical.fill", android: "auto_stories", web: "auto_stories" },
  },
  {
    id: "book",
    name: "Book",
    symbol: { ios: "book.closed.fill", android: "menu_book", web: "menu_book" },
  },
  {
    id: "star",
    name: "Star",
    symbol: { ios: "star.fill", android: "star", web: "star" },
  },
  {
    id: "heart",
    name: "Heart",
    symbol: { ios: "heart.fill", android: "favorite", web: "favorite" },
  },
  {
    id: "palette",
    name: "Art",
    symbol: { ios: "paintpalette.fill", android: "palette", web: "palette" },
  },
  {
    id: "camera",
    name: "Camera",
    symbol: { ios: "camera.fill", android: "photo_camera", web: "photo_camera" },
  },
  {
    id: "paw",
    name: "Paw",
    symbol: { ios: "pawprint.fill", android: "pets", web: "pets" },
  },
  {
    id: "rocket",
    name: "Space",
    symbol: { ios: "paperplane.fill", android: "rocket_launch", web: "rocket_launch" },
  },
] as const;

export function isPadIconId(value: unknown): value is PadIconId {
  return PAD_ICONS.some((option) => option.id === value);
}

export function getPadIcon(value: unknown): PadIconOption {
  return PAD_ICONS.find((option) => option.id === value) ?? PAD_ICONS[0];
}
