import type { Drawing } from "@/store/migrate";

export interface ArtworkListItem {
  drawing: Drawing;
  padId: string;
  padName: string;
}

export interface ArtworkFilters {
  query?: string;
  favoritesOnly?: boolean;
  padId?: string | null;
  tag?: string | null;
}

export function normalizeArtworkTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim().replace(/\s+/g, " ").slice(0, 24);
    const normalized = name.toLocaleLowerCase();
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(name);
    if (tags.length === 12) break;
  }
  return tags;
}

export function artworkMatchesQuery(item: ArtworkListItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const drawing = item.drawing;
  return [drawing.title, drawing.notes, item.padName, ...(drawing.tags ?? [])]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

export function filterArtworkItems(
  items: readonly ArtworkListItem[],
  filters: ArtworkFilters,
): ArtworkListItem[] {
  return items
    .filter((item) => artworkMatchesQuery(item, filters.query ?? ""))
    .filter((item) => !filters.favoritesOnly || item.drawing.favorite === true)
    .filter((item) => !filters.padId || item.padId === filters.padId)
    .filter(
      (item) =>
        !filters.tag ||
        (item.drawing.tags ?? []).some(
          (tag) => tag.toLocaleLowerCase() === filters.tag?.toLocaleLowerCase(),
        ),
    )
    .sort((a, b) => b.drawing.addedAt - a.drawing.addedAt);
}

export function artworkTags(items: readonly ArtworkListItem[]): string[] {
  const names = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.drawing.tags ?? []) {
      const normalized = tag.toLocaleLowerCase();
      if (!names.has(normalized)) names.set(normalized, tag);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
