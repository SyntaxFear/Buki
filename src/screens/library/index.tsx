import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  artworkTags,
  filterArtworkItems,
  normalizeArtworkText,
  selectedVisibleArtworkIds,
  type ArtworkListItem,
} from "@/organization/artwork-organizer";
import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { confirmAdult } from "@/store/parental-gate";
import { useProfiles } from "@/store/profiles";
import { colors } from "@/theme";

function shortDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

export function ArtLibrary() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pads = useDrawings((state) => state.pads);
  const drawingsByPad = useDrawings((state) => state.drawingsByPad);
  const bulkSetFavorite = useDrawings((state) => state.bulkSetFavorite);
  const bulkAddTag = useDrawings((state) => state.bulkAddTag);
  const bulkMoveDrawings = useDrawings((state) => state.bulkMoveDrawings);
  const bulkDeleteDrawings = useDrawings((state) => state.bulkDeleteDrawings);
  const activeChildId = useProfiles((state) => state.activeChildId);
  const advanced = useMembership((state) => state.capabilities.advancedOrganization);
  const requestUpgrade = useMembership((state) => state.requestUpgrade);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [padFilter, setPadFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const childPads = useMemo(
    () => pads.filter((pad) => pad.childId === activeChildId),
    [activeChildId, pads],
  );
  const allItems = useMemo<ArtworkListItem[]>(
    () =>
      childPads.flatMap((pad) =>
        (drawingsByPad[pad.id] ?? []).map((drawing) => ({
          drawing,
          padId: pad.id,
          padName: pad.name,
        })),
      ),
    [childPads, drawingsByPad],
  );
  const tags = useMemo(() => artworkTags(allItems), [allItems]);
  const visibleItems = useMemo(
    () =>
      filterArtworkItems(allItems, {
        query: advanced ? query : "",
        favoritesOnly: advanced && favoritesOnly,
        padId: advanced ? padFilter : null,
        tag: advanced ? tagFilter : null,
      }),
    [advanced, allItems, favoritesOnly, padFilter, query, tagFilter],
  );
  const selectedIds = useMemo(
    () => selectedVisibleArtworkIds(visibleItems, selected),
    [selected, visibleItems],
  );
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selected.has(item.drawing.id)),
    [selected, visibleItems],
  );
  const hasSelection = selectedIds.length > 0;
  const cardWidth = Math.floor((width - 16 * 2 - 12) / 2);

  useEffect(() => {
    const valid = new Set(visibleItems.map((item) => item.drawing.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleItems]);

  useEffect(() => {
    if (advanced) return;
    setQuery("");
    setFavoritesOnly(false);
    setPadFilter(null);
    setTagFilter(null);
    setSelected(new Set());
  }, [advanced]);

  const requirePro = (source: string): boolean => {
    if (advanced) return true;
    requestUpgrade("advancedOrganization", source);
    return false;
  };

  const toggleSelected = (id: string) => {
    if (!requirePro("library_bulk_select")) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openArtwork = (item: ArtworkListItem) => {
    if (hasSelection) {
      toggleSelected(item.drawing.id);
      return;
    }
    router.push({ pathname: "/artwork", params: { id: item.drawing.id } });
  };

  const addBulkTag = () => {
    Alert.prompt(
      "Tag selected artwork",
      "Use a short tag such as School, Spring, or Animals.",
      (value) => {
        if (value && bulkAddTag(selectedIds, value)) setSelected(new Set());
      },
      "plain-text",
    );
  };

  const chooseMoveTarget = () => {
    const sourcePadIds = new Set(selectedItems.map((item) => item.padId));
    const targets = childPads.filter((pad) => !sourcePadIds.has(pad.id) || sourcePadIds.size > 1);
    if (targets.length === 0) {
      Alert.alert("No other sketchpad", "Create another sketchpad before moving artwork.");
      return;
    }
    Alert.alert(
      "Move selected artwork",
      "Choose a sketchpad.",
      [
        ...targets.map((pad) => ({
          text: pad.name,
          onPress: () => {
            if (bulkMoveDrawings(selectedIds, pad.id)) setSelected(new Set());
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  const confirmBulkDelete = async () => {
    if (!(await confirmAdult("Deleting several artworks permanently removes their local image files."))) return;
    Alert.alert(
      `Delete ${selectedIds.length} artwork${selectedIds.length === 1 ? "" : "s"}?`,
      "This cannot be undone on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (bulkDeleteDrawings(selectedIds)) setSelected(new Set());
          },
        },
      ],
    );
  };

  const header = (
    <View style={styles.listHeader}>
      {advanced ? (
        <View style={styles.searchBox}>
          <SymbolView name="magnifyingglass" size={17} tintColor={colors.mutedText} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles, notes, tags, and sketchpads"
            placeholderTextColor="#9E9588"
            returnKeyType="search"
            accessibilityLabel="Search artwork"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <SymbolView name="xmark.circle.fill" size={17} tintColor={colors.mutedText} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => requirePro("library_search")}
          accessibilityRole="button"
          accessibilityLabel="Search, filters, and bulk actions. Pro locked"
          accessibilityHint="Opens Buki Pro options"
          style={({ pressed }) => [styles.searchBox, pressed && styles.pressed]}
        >
          <SymbolView name="magnifyingglass" size={17} tintColor={colors.mutedText} />
          <Text style={styles.lockedSearch}>Search, filters, and bulk actions</Text>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.filterRow}>
        <FilterChip
          label="All"
          selected={!favoritesOnly && !padFilter && !tagFilter}
          locked={!advanced}
          onPress={() => {
            if (!requirePro("library_filters")) return;
            setFavoritesOnly(false);
            setPadFilter(null);
            setTagFilter(null);
          }}
        />
        <FilterChip
          label="Favorites"
          selected={favoritesOnly}
          locked={!advanced}
          onPress={() => {
            if (requirePro("library_favorites_filter")) setFavoritesOnly((value) => !value);
          }}
        />
        {childPads.map((pad) => (
          <FilterChip
            key={pad.id}
            label={pad.name}
            selected={padFilter === pad.id}
            locked={!advanced}
            onPress={() => {
              if (requirePro("library_sketchpad_filter")) {
                setPadFilter((current) => (current === pad.id ? null : pad.id));
              }
            }}
          />
        ))}
      </View>

      {tags.length ? (
        <View style={styles.tagFilters}>
          {tags.map((tag) => (
            <FilterChip
              key={tag}
              label={`#${tag}`}
              selected={normalizeArtworkText(tagFilter ?? "") === normalizeArtworkText(tag)}
              locked={!advanced}
              onPress={() => {
                if (requirePro("library_tag_filter")) {
                  setTagFilter((current) => (current === tag ? null : tag));
                }
              }}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.resultLine}>
        <Text style={styles.resultCount}>
          {visibleItems.length} artwork{visibleItems.length === 1 ? "" : "s"}
        </Text>
        {hasSelection ? (
          <Pressable
            onPress={() => setSelected(new Set())}
            accessibilityRole="button"
            accessibilityLabel="Cancel artwork selection"
          >
            <Text style={styles.clearSelection}>Cancel selection</Text>
          </Pressable>
        ) : (
          <Text style={styles.selectionHint}>Long-press an artwork for bulk actions</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.navigation, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.eyebrow}>BUKI LIBRARY</Text>
          <Text style={styles.navigationTitle}>All Artwork</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close art library"
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.drawing.id}
        numColumns={2}
        contentInsetAdjustmentBehavior="automatic"
        columnWrapperStyle={styles.column}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (hasSelection ? 118 : 42) },
        ]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎨</Text>
            <Text style={styles.emptyTitle}>{allItems.length ? "No matches" : "No artwork yet"}</Text>
            <Text style={styles.emptyBody}>
              {allItems.length
                ? "Try clearing a filter or searching for another word."
                : "Scan the first masterpiece and it will appear here."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selected.has(item.drawing.id);
          return (
            <Pressable
              onPress={() => openArtwork(item)}
              onLongPress={() => toggleSelected(item.drawing.id)}
              accessibilityRole="button"
              accessibilityLabel={`${item.drawing.title || "Untitled artwork"}, ${item.padName}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [
                styles.artworkCard,
                { width: cardWidth },
                isSelected && styles.artworkCardSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.artworkImageWrap}>
                <Image source={{ uri: item.drawing.uri }} style={styles.artworkImage} contentFit="contain" />
                {item.drawing.favorite ? (
                  <View style={styles.favoriteBadge}>
                    <SymbolView name="heart.fill" size={13} tintColor="#FFFFFF" />
                  </View>
                ) : null}
                {isSelected ? (
                  <View style={styles.selectionBadge}>
                    <SymbolView name="checkmark" size={12} tintColor="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.artworkTitle} numberOfLines={1}>
                {item.drawing.title || "Untitled masterpiece"}
              </Text>
              <Text style={styles.artworkMeta} numberOfLines={1}>
                {item.padName} · {shortDate(item.drawing.addedAt)}
              </Text>
              {(item.drawing.tags ?? []).length ? (
                <Text style={styles.artworkTags} numberOfLines={1}>
                  {(item.drawing.tags ?? []).map((tag) => `#${tag}`).join("  ")}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />

      {hasSelection ? (
        <View style={[styles.bulkBar, { bottom: insets.bottom + 10 }]}>
          <BulkAction
            icon="heart.fill"
            label={selectedItems.every((item) => item.drawing.favorite) ? "Unfavorite" : "Favorite"}
            onPress={() => {
              const favorite = !selectedItems.every((item) => item.drawing.favorite);
              if (bulkSetFavorite(selectedIds, favorite)) setSelected(new Set());
            }}
          />
          <BulkAction icon="tag.fill" label="Tag" onPress={addBulkTag} />
          <BulkAction icon="folder.fill" label="Move" onPress={chooseMoveTarget} />
          <BulkAction icon="trash.fill" label="Delete" destructive onPress={() => void confirmBulkDelete()} />
        </View>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  selected,
  locked,
  onPress,
}: {
  label: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${locked ? ". Pro locked" : ""}`}
      accessibilityHint={locked ? "Opens Buki Pro options" : `Filters artwork by ${label}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function BulkAction({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: "heart.fill" | "tag.fill" | "folder.fill" | "trash.fill";
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} selected artwork`}
      accessibilityHint={destructive ? "Permanently deletes selected artwork after confirmation" : undefined}
      style={({ pressed }) => [styles.bulkAction, pressed && styles.pressed]}
    >
      <SymbolView name={icon} size={17} tintColor={destructive ? "#C54A4A" : colors.titleTeal} />
      <Text style={[styles.bulkActionText, destructive && styles.bulkActionDestructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundDeep },
  navigation: { minHeight: 78, paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  eyebrow: { fontSize: 10.5, fontWeight: "900", letterSpacing: 1.1, color: colors.titleCoral },
  navigationTitle: { fontSize: 25, lineHeight: 30, fontWeight: "900", color: colors.ink },
  doneButton: { minWidth: 62, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  doneLabel: { fontSize: 16, fontWeight: "800", color: colors.titleTeal },
  listContent: { padding: 16, gap: 12 },
  listHeader: { gap: 12, paddingBottom: 4 },
  searchBox: { minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 17, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, minHeight: 48, fontSize: 15, color: colors.ink },
  lockedSearch: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.mutedText },
  proBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.bloomYellow },
  proBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, color: colors.ink },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tagFilters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filterChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipSelected: { backgroundColor: colors.titleTeal, borderColor: colors.titleTeal },
  filterChipText: { fontSize: 12.5, fontWeight: "800", color: colors.ink },
  filterChipTextSelected: { color: "#FFFFFF" },
  resultLine: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  resultCount: { fontSize: 13, fontWeight: "900", color: colors.ink },
  selectionHint: { flex: 1, fontSize: 10.5, color: colors.mutedText, textAlign: "right" },
  clearSelection: { fontSize: 12, fontWeight: "900", color: colors.titleCoral },
  column: { gap: 12 },
  artworkCard: { minHeight: 228, padding: 10, marginBottom: 12, borderRadius: 20, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  artworkCardSelected: { borderWidth: 2.5, borderColor: colors.titleTeal, backgroundColor: "#F2FBF9" },
  artworkImageWrap: { height: 148, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.page, position: "relative" },
  artworkImage: { width: "100%", height: "100%" },
  favoriteBadge: { position: "absolute", right: 8, top: 8, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.titleCoral },
  selectionBadge: { position: "absolute", left: 8, top: 8, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.titleTeal },
  artworkTitle: { marginTop: 9, fontSize: 14, fontWeight: "900", color: colors.ink },
  artworkMeta: { marginTop: 2, fontSize: 10.5, color: colors.mutedText },
  artworkTags: { marginTop: 5, fontSize: 10.5, fontWeight: "700", color: colors.titleTeal },
  emptyState: { minHeight: 340, padding: 30, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyIcon: { fontSize: 42 },
  emptyTitle: { fontSize: 21, fontWeight: "900", color: colors.ink },
  emptyBody: { maxWidth: 280, fontSize: 13.5, lineHeight: 19, color: colors.mutedText, textAlign: "center" },
  bulkBar: { position: "absolute", left: 12, right: 12, minHeight: 76, padding: 8, flexDirection: "row", justifyContent: "space-around", borderRadius: 24, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: "0 8px 24px rgba(40,67,90,0.20)" },
  bulkAction: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 16 },
  bulkActionText: { fontSize: 10.5, fontWeight: "900", color: colors.titleTeal },
  bulkActionDestructive: { color: "#C54A4A" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
