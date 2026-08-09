import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";

import { getPadDesign } from "@/pad-designs";
import type { Drawing, PadStyle, Sketchpad } from "@/store/migrate";
import { unitCapacity } from "@/utils/book-layout";
import { requireExportAccess } from "./export-access";
import { escapeHtml, exportSlug, isoDate } from "./export-utils";

const LANDSCAPE = { width: 842, height: 595 } as const;
const PORTRAIT = { width: 595, height: 842 } as const;

export interface EmbeddedPdfArtwork {
  drawing: Drawing;
  dataUri: string | null;
}

export interface SketchpadPdfDocument {
  html: string;
  width: number;
  height: number;
  pageCount: number;
}

export interface SketchpadPdfResult {
  uri: string;
  filename: string;
  pageCount: number;
  missingCount: number;
}

interface PdfDocumentInput {
  pad: Sketchpad;
  artworks: EmbeddedPdfArtwork[];
  childName?: string;
  generatedAt?: number;
}

const LAYOUT_LABELS: Record<PadStyle, string> = {
  spread: "Open spread",
  vertical: "Portrait pages",
  album: "Landscape album",
  grid: "Four-art grid",
  strip: "Three-art filmstrip",
};

function dimensionsForStyle(style: PadStyle): typeof LANDSCAPE | typeof PORTRAIT {
  return style === "vertical" || style === "grid" || style === "strip" ? PORTRAIT : LANDSCAPE;
}

function borderClass(border: Sketchpad["border"]): string {
  return `border-${border}`;
}

function decorationMarks(decoration: Sketchpad["decoration"]): string {
  switch (decoration) {
    case "confetti-pop":
      return "<span class=\"decor decor-a\">●</span><span class=\"decor decor-b\">●</span><span class=\"decor decor-c\">●</span>";
    case "sparkle-trail":
      return "<span class=\"decor decor-a\">✦</span><span class=\"decor decor-b\">✧</span><span class=\"decor decor-c\">✦</span>";
    case "heart-parade":
      return "<span class=\"decor decor-a\">♥</span><span class=\"decor decor-b\">♡</span><span class=\"decor decor-c\">♥</span>";
    case "flower-garden":
      return "<span class=\"decor decor-a\">✿</span><span class=\"decor decor-b\">❀</span><span class=\"decor decor-c\">✿</span>";
    case "starry-sky":
      return "<span class=\"decor decor-a\">★</span><span class=\"decor decor-b\">✦</span><span class=\"decor decor-c\">☆</span>";
    case "sticker-party":
      return "<span class=\"decor decor-a\">★</span><span class=\"decor decor-b\">♥</span><span class=\"decor decor-c\">●</span>";
    default:
      return "";
  }
}

function artworkCaption(drawing: Drawing): string {
  const title = escapeHtml(drawing.title?.trim() || "Untitled artwork");
  const details = [isoDate(drawing.addedAt), ...(drawing.tags ?? [])].map(escapeHtml).join(" · ");
  const notes = drawing.notes?.trim()
    ? `<div class=\"art-notes\">${escapeHtml(drawing.notes.trim())}</div>`
    : "";
  return `<div class=\"art-caption\"><strong>${title}</strong><span>${details}</span>${notes}</div>`;
}

function artworkSlot(artwork: EmbeddedPdfArtwork | undefined, pad: Sketchpad): string {
  if (!artwork) return "<div class=\"slot slot-empty\"><span>Room for the next masterpiece</span></div>";
  const { drawing, dataUri } = artwork;
  const image = dataUri
    ? `<img src=\"${dataUri}\" alt=\"${escapeHtml(drawing.title?.trim() || "Artwork")}\" style=\"transform:rotate(${Math.max(-10, Math.min(10, drawing.rotation)).toFixed(2)}deg)\" />`
    : "<div class=\"missing-image\"><strong>Image unavailable</strong><span>The artwork record is preserved in Buki.</span></div>";
  return `<article class=\"slot ${borderClass(pad.border)}\">${decorationMarks(pad.decoration)}<div class=\"image-space\">${image}</div>${artworkCaption(drawing)}</article>`;
}

function contentPage(
  pad: Sketchpad,
  artworks: EmbeddedPdfArtwork[],
  pageIndex: number,
  pageTotal: number,
): string {
  const slots = Array.from({ length: unitCapacity(pad.style) }, (_, index) => artworkSlot(artworks[index], pad)).join("");
  return `<section class=\"sheet content-sheet style-${pad.style}\">
    <header class=\"page-header\"><span>${escapeHtml(pad.name)}</span><span>${LAYOUT_LABELS[pad.style]}</span></header>
    <main class=\"slots\">${slots}</main>
    <footer class=\"page-footer\"><span>Made with Buki</span><span>${pageIndex} / ${pageTotal}</span></footer>
  </section>`;
}

export function buildSketchpadPdfDocument({
  pad,
  artworks,
  childName,
  generatedAt = Date.now(),
}: PdfDocumentInput): SketchpadPdfDocument {
  const dimensions = dimensionsForStyle(pad.style);
  const capacity = unitCapacity(pad.style);
  const contentPageCount = Math.max(1, Math.ceil(artworks.length / capacity));
  const pageCount = contentPageCount + 1;
  const design = getPadDesign(pad.design, pad.coverColor);
  const content = Array.from({ length: contentPageCount }, (_, page) =>
    contentPage(pad, artworks.slice(page * capacity, (page + 1) * capacity), page + 1, contentPageCount),
  ).join("");
  const owner = childName?.trim() ? `${escapeHtml(childName.trim())}’s collection` : "A family art collection";
  const generated = isoDate(generatedAt);

  const html = `<!doctype html>
<html>
<head>
<meta charset=\"utf-8\" />
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<style>
  @page { size: ${dimensions.width}px ${dimensions.height}px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #28435a; font-family: -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Arial, sans-serif; }
  body { background: ${design.pageStack}; }
  .sheet { position: relative; width: ${dimensions.width}px; height: ${dimensions.height}px; overflow: hidden; break-after: page; page-break-after: always; }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .cover { display: flex; align-items: center; justify-content: center; padding: 46px; background: ${design.cover}; color: white; }
  .cover::before { content: \"\"; position: absolute; inset: 22px; border: 3px solid rgba(255,255,255,.38); border-radius: 30px; }
  .cover-card { position: relative; width: 76%; padding: 48px 42px; text-align: center; background: rgba(255,255,255,.94); color: #28435a; border-radius: 28px; box-shadow: 0 14px 35px rgba(24,36,46,.24); }
  .cover-kicker { margin: 0 0 10px; color: ${design.coverDark}; font-size: 14px; font-weight: 800; letter-spacing: 2.2px; text-transform: uppercase; }
  .cover h1 { margin: 0; font-size: 46px; line-height: 1.05; }
  .cover-owner { margin: 14px 0 0; color: #75685a; font-size: 21px; }
  .cover-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px 12px; margin: 26px 0 0; color: #75685a; font-size: 14px; }
  .cover-meta span { white-space: nowrap; }
  .cover-mark { position: absolute; right: 34px; bottom: 24px; font-size: 34px; color: ${design.ring}; }
  .content-sheet { padding: 28px 34px 24px; background: ${pad.pageColor || design.paper}; }
  .page-header, .page-footer { display: flex; justify-content: space-between; align-items: center; color: #75685a; font-size: 12px; font-weight: 700; letter-spacing: .5px; }
  .page-header { height: 28px; border-bottom: 1px solid ${design.pageEdge}; }
  .page-footer { position: absolute; left: 34px; right: 34px; bottom: 10px; }
  .slots { display: grid; width: 100%; height: calc(100% - 56px); gap: 18px; padding-top: 16px; }
  .style-spread .slots { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .style-album .slots, .style-vertical .slots { grid-template-columns: 1fr; }
  .style-grid .slots { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 13px; }
  .style-strip .slots { grid-template-columns: 1fr; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .slot { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 14px 14px 11px; background: rgba(255,255,255,.78); border: 2px solid ${design.slotBorder}; border-radius: 18px; overflow: hidden; }
  .slot-empty { align-items: center; justify-content: center; color: #a99987; border-style: dashed; font-size: 15px; }
  .image-space { min-height: 0; flex: 1; display: flex; align-items: center; justify-content: center; padding: 5px; }
  .image-space img { display: block; max-width: 92%; max-height: 92%; object-fit: contain; }
  .missing-image { width: 78%; padding: 18px; text-align: center; color: #8a6f62; background: #fff3ec; border: 2px dashed #e5b7a2; border-radius: 14px; }
  .missing-image strong, .missing-image span { display: block; }
  .missing-image span { margin-top: 5px; font-size: 11px; }
  .art-caption { flex: none; display: grid; gap: 2px; padding: 6px 18px 0; text-align: center; }
  .art-caption strong { font-size: 15px; line-height: 1.1; }
  .art-caption span { overflow: hidden; color: #75685a; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .art-notes { max-height: 28px; overflow: hidden; color: #665d54; font-size: 10px; line-height: 1.3; }
  .style-grid .slot, .style-strip .slot { padding: 8px; border-radius: 13px; }
  .style-grid .art-caption, .style-strip .art-caption { padding-inline: 14px; }
  .style-grid .art-caption strong, .style-strip .art-caption strong { font-size: 12px; }
  .style-grid .art-notes, .style-strip .art-notes { display: none; }
  .border-gallery-mat { border: 9px double #b7d7d2; }
  .border-polaroid { border: 7px solid #f8f6ef; box-shadow: inset 0 0 0 1px #d9d3c6; padding-bottom: 18px; }
  .border-torn-paper { border: 5px dashed #d7c5a7; border-radius: 7px; }
  .border-washi-tape::before, .border-washi-tape::after { content: \"\"; position: absolute; z-index: 3; top: 4px; width: 52px; height: 14px; background: rgba(245,200,91,.82); }
  .border-washi-tape::before { left: -12px; transform: rotate(-15deg); }
  .border-washi-tape::after { right: -12px; transform: rotate(15deg); }
  .border-scalloped { border: 7px dotted #f3a6be; }
  .border-crayon-edge { border: 4px solid #6fa9e8; box-shadow: inset 0 0 0 3px rgba(255,118,94,.55); }
  .border-sticker-stars { border: 4px solid #ffd65a; }
  .border-sticker-stars::before, .border-sticker-stars::after { content: \"★\"; position: absolute; z-index: 3; color: #e1ad27; font-size: 24px; }
  .border-sticker-stars::before { left: 4px; top: 1px; }
  .border-sticker-stars::after { right: 4px; bottom: 1px; }
  .border-museum-frame { border: 10px double #c89b4b; box-shadow: inset 0 0 0 2px #6f4f20; }
  .decor { position: absolute; z-index: 4; color: ${design.stampColor}; font-size: 18px; line-height: 1; }
  .decor-a { left: 7px; top: 7px; } .decor-b { right: 8px; top: 9px; } .decor-c { right: 9px; bottom: 44px; }
</style>
</head>
<body>
  <section class=\"sheet cover\">
    <div class=\"cover-card\">
      <p class=\"cover-kicker\">Buki Sketchpad</p>
      <h1>${escapeHtml(pad.name)}</h1>
      <p class=\"cover-owner\">${owner}</p>
      <p class=\"cover-meta\"><span>${artworks.length} artwork${artworks.length === 1 ? "" : "s"}</span><span>${LAYOUT_LABELS[pad.style]}</span><span>Exported ${generated}</span></p>
    </div>
    <div class=\"cover-mark\">${design.stamp === "heart" ? "♥" : design.stamp === "flower" ? "✿" : design.stamp === "paw" ? "●" : "✦"}</div>
  </section>
  ${content}
</body>
</html>`;

  return { html, width: dimensions.width, height: dimensions.height, pageCount };
}

export function sketchpadPdfFilename(pad: Pick<Sketchpad, "name" | "id">): string {
  return `buki-${exportSlug(pad.name, exportSlug(pad.id, "sketchpad"))}-sketchpad.pdf`;
}

export async function createSketchpadPdf(input: {
  pad: Sketchpad;
  drawings: Drawing[];
  childName?: string;
}): Promise<SketchpadPdfResult> {
  requireExportAccess("sketchpad_pdf_export");
  let missingCount = 0;
  const artworks: EmbeddedPdfArtwork[] = [];
  for (const drawing of input.drawings) {
    const file = new File(drawing.uri);
    if (!file.exists) {
      missingCount += 1;
      artworks.push({ drawing, dataUri: null });
      continue;
    }
    artworks.push({ drawing, dataUri: `data:image/png;base64,${await file.base64()}` });
  }

  const document = buildSketchpadPdfDocument({
    pad: input.pad,
    artworks,
    childName: input.childName,
  });
  const printed = await Print.printToFileAsync({
    html: document.html,
    width: document.width,
    height: document.height,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  const filename = sketchpadPdfFilename(input.pad);
  const destination = new File(Paths.cache, filename);
  try {
    requireExportAccess("sketchpad_pdf_export_commit");
    await new File(printed.uri).copy(destination, { overwrite: true });
    requireExportAccess("sketchpad_pdf_export_complete");
    return {
      uri: destination.uri,
      filename,
      pageCount: printed.numberOfPages || document.pageCount,
      missingCount,
    };
  } catch (error) {
    try { if (destination.exists) destination.delete(); } catch {}
    throw error;
  }
}
