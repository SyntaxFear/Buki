import {
  Skia,
  Text as SkiaText,
  type SkCanvas,
  type SkFont,
} from "@shopify/react-native-skia";

import type { Rect } from "@/utils/book-layout";
import {
  pageFolioPosition,
  type PageFolioEdge,
} from "@/utils/page-folio";

export interface PageFolioSpec {
  number: number;
  edge: PageFolioEdge;
  color: string;
  font: SkFont | null;
}

interface Props extends PageFolioSpec {
  frame: Rect;
}

export const PAGE_FOLIO_FONT_SIZE = 18;

function folioPosition(
  number: number,
  frame: Rect,
  edge: PageFolioEdge,
  font: SkFont,
) {
  const text = String(number);
  const bounds = font.measureText(text);
  const metrics = font.getMetrics();
  return {
    text,
    ...pageFolioPosition(frame, edge, bounds.width, metrics.descent),
  };
}

/** A folio drawn inside the live Skia paper, beneath any turning sheet. */
export function PageFolio({ number, frame, edge, color, font }: Props) {
  if (!font) return null;
  const position = folioPosition(number, frame, edge, font);

  return (
    <SkiaText
      text={position.text}
      x={position.x}
      y={position.y}
      font={font}
      color={color}
    />
  );
}

/** The same folio rendered into an offscreen page-turn snapshot. */
export function drawSnapshotPageFolio(
  canvas: SkCanvas,
  width: number,
  height: number,
  folio: PageFolioSpec,
): void {
  if (!folio.font) return;
  const position = folioPosition(
    folio.number,
    { x: 0, y: 0, width, height },
    folio.edge,
    folio.font,
  );
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(folio.color));
  canvas.drawText(
    position.text,
    position.x,
    position.y,
    paint,
    folio.font,
  );
}
