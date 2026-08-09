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

export function normalizeArtworkText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function normalizeArtworkTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 24);
    const normalized = normalizeArtworkText(name);
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(name);
    if (tags.length === 12) break;
  }
  return tags;
}

export function artworkMatchesQuery(item: ArtworkListItem, query: string): boolean {
  const needle = normalizeArtworkText(query);
  if (!needle) return true;
  const drawing = item.drawing;
  return [drawing.title, drawing.notes, item.padName, ...(drawing.tags ?? [])]
    .filter((value): value is string => typeof value === "string")
    .some((value) => normalizeArtworkText(value).includes(needle));
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
          (tag) => normalizeArtworkText(tag) === normalizeArtworkText(filters.tag ?? ""),
        ),
    )
    .sort((a, b) => b.drawing.addedAt - a.drawing.addedAt);
}

export function artworkTags(items: readonly ArtworkListItem[]): string[] {
  const names = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.drawing.tags ?? []) {
      const normalized = normalizeArtworkText(tag);
      if (!names.has(normalized)) names.set(normalized, tag);
    }
  }
  return [...names.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, name]) => name);
}

export function selectedVisibleArtworkIds(
  visibleItems: readonly ArtworkListItem[],
  selectedIds: ReadonlySet<string>,
): string[] {
  return visibleItems
    .map((item) => item.drawing.id)
    .filter((id) => selectedIds.has(id));
}
