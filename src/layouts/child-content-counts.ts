export interface ChildContentCount {
  sketchpads: number;
  artworks: number;
}

export function artworkCountLabel(count: number): string {
  return `${count} artwork${count === 1 ? "" : "s"}`;
}

export function sketchpadCountLabel(count: number): string {
  return `${count} sketchpad${count === 1 ? "" : "s"}`;
}

export function childContentCounts(
  children: readonly { id: string }[],
  pads: readonly { id: string; childId: string }[],
  drawingsByPad: Readonly<Record<string, readonly unknown[]>>,
): Record<string, ChildContentCount> {
  const counts = Object.fromEntries(
    children.map((child) => [child.id, { sketchpads: 0, artworks: 0 }]),
  ) as Record<string, ChildContentCount>;

  for (const pad of pads) {
    const count = counts[pad.childId];
    if (!count) continue;
    count.sketchpads += 1;
    count.artworks += drawingsByPad[pad.id]?.length ?? 0;
  }

  return counts;
}

export function childContentSummary(count: ChildContentCount): string {
  return `${sketchpadCountLabel(count.sketchpads)} · ${artworkCountLabel(count.artworks)}`;
}
