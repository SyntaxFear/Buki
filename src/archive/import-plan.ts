import type {
  BukiArchiveArtwork,
  BukiArchiveChild,
  BukiArchiveManifest,
  BukiArchiveSketchpad,
} from "./format";

export interface PlannedArchiveArtwork {
  id: string;
  padId: string;
  source: BukiArchiveArtwork;
}

export interface PlannedArchivePad {
  id: string;
  childId: string;
  source: BukiArchiveSketchpad;
  artworks: PlannedArchiveArtwork[];
}

export interface PlannedArchiveChild {
  id: string;
  name: string;
  source: BukiArchiveChild;
  pads: PlannedArchivePad[];
}

export interface ArchiveImportPlan {
  children: PlannedArchiveChild[];
  duplicatesSkipped: number;
  missingSkipped: number;
}

export interface ExistingArchiveLibrary {
  childNames: string[];
  emptyPadSignatures: string[];
  artworkChecksums: string[];
}

export function emptyPadSignature(childCreatedAt: number, pad: Pick<BukiArchiveSketchpad, "name" | "style" | "createdAt">): string {
  return [childCreatedAt, pad.name.trim().toLocaleLowerCase(), pad.style, pad.createdAt].join("|");
}

function uniqueImportedChildName(name: string, usedNames: Set<string>): string {
  const base = name.trim() || "Imported Child";
  if (!usedNames.has(base.toLocaleLowerCase())) {
    usedNames.add(base.toLocaleLowerCase());
    return base;
  }
  let index = 1;
  while (true) {
    const suffix = index === 1 ? " (Imported)" : ` (Imported ${index})`;
    const candidate = `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
    if (!usedNames.has(candidate.toLocaleLowerCase())) {
      usedNames.add(candidate.toLocaleLowerCase());
      return candidate;
    }
    index += 1;
  }
}

export function planBukiArchiveImport(
  manifest: BukiArchiveManifest,
  existing: ExistingArchiveLibrary,
  makeId: () => string,
): ArchiveImportPlan {
  const usedNames = new Set(existing.childNames.map((name) => name.trim().toLocaleLowerCase()));
  const emptyPads = new Set(existing.emptyPadSignatures);
  const seenChecksums = new Set(existing.artworkChecksums);
  const artworksByPad = new Map<string, BukiArchiveArtwork[]>();
  for (const artwork of manifest.artworks) {
    const list = artworksByPad.get(artwork.sketchpadId) ?? [];
    list.push(artwork);
    artworksByPad.set(artwork.sketchpadId, list);
  }
  const padsByChild = new Map<string, BukiArchiveSketchpad[]>();
  for (const pad of manifest.sketchpads) {
    const list = padsByChild.get(pad.childId) ?? [];
    list.push(pad);
    padsByChild.set(pad.childId, list);
  }

  let duplicatesSkipped = 0;
  let missingSkipped = 0;
  const children: PlannedArchiveChild[] = [];

  for (const child of manifest.children) {
    const sourcePads = padsByChild.get(child.id) ?? [];
    const plannedPadSources: Array<{ source: BukiArchiveSketchpad; artworks: BukiArchiveArtwork[] }> = [];

    for (const pad of sourcePads) {
      const sourceArtworks = artworksByPad.get(pad.id) ?? [];
      const plannedArtworks: BukiArchiveArtwork[] = [];
      for (const artwork of sourceArtworks) {
        if (!artwork.cutout) {
          missingSkipped += 1;
          continue;
        }
        if (seenChecksums.has(artwork.cutout.checksum)) {
          duplicatesSkipped += 1;
          continue;
        }
        seenChecksums.add(artwork.cutout.checksum);
        plannedArtworks.push(artwork);
      }

      if (sourceArtworks.length > 0 && plannedArtworks.length === 0) continue;
      if (sourceArtworks.length === 0 && emptyPads.has(emptyPadSignature(child.createdAt, pad))) continue;
      plannedPadSources.push({ source: pad, artworks: plannedArtworks });
    }

    if (sourcePads.length > 0 && plannedPadSources.length === 0) continue;
    if (sourcePads.length === 0) continue;

    const childId = makeId();
    const plannedChild: PlannedArchiveChild = {
      id: childId,
      name: uniqueImportedChildName(child.name, usedNames),
      source: child,
      pads: [],
    };
    for (const plannedPad of plannedPadSources) {
      const padId = makeId();
      plannedChild.pads.push({
        id: padId,
        childId,
        source: plannedPad.source,
        artworks: plannedPad.artworks.map((source) => ({ id: makeId(), padId, source })),
      });
    }
    children.push(plannedChild);
  }

  return { children, duplicatesSkipped, missingSkipped };
}
