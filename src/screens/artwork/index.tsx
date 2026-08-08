import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { confirmAdult } from "@/store/parental-gate";
import { colors } from "@/theme";

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function artworkDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ArtworkDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(params.id);
  const drawing = useDrawings((state) =>
    id
      ? Object.values(state.drawingsByPad)
          .flat()
          .find((item) => item.id === id)
      : undefined,
  );
  const padId = useDrawings((state) =>
    id
      ? Object.entries(state.drawingsByPad).find(([, drawings]) =>
          drawings.some((item) => item.id === id),
        )?.[0] ?? null
      : null,
  );
  const pad = useDrawings((state) => state.pads.find((item) => item.id === padId));
  const updateMetadata = useDrawings((state) => state.updateDrawingMetadata);
  const toggleFavorite = useDrawings((state) => state.toggleDrawingFavorite);
  const setDrawingTags = useDrawings((state) => state.setDrawingTags);
  const deleteDrawing = useDrawings((state) => state.deleteDrawing);
  const advancedOrganization = useMembership(
    (state) => state.capabilities.advancedOrganization,
  );
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTitle(drawing?.title ?? "");
    setNotes(drawing?.notes ?? "");
    setSaved(false);
  }, [drawing?.id, drawing?.notes, drawing?.title]);

  const changed = useMemo(
    () => title.trim() !== (drawing?.title ?? "") || notes.trim() !== (drawing?.notes ?? ""),
    [drawing?.notes, drawing?.title, notes, title],
  );

  if (!drawing) {
    return (
      <View style={[styles.missingRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.missingTitle}>Artwork not found</Text>
        <Text style={styles.missingBody}>It may have been removed from this device.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const tags = drawing.tags ?? [];

  const save = () => {
    if (updateMetadata(drawing.id, { title, notes })) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1_500);
    }
  };

  const addTag = () => {
    const next = tagDraft.trim();
    if (!next) return;
    if (setDrawingTags(drawing.id, [...tags, next])) setTagDraft("");
  };

  const confirmDelete = async () => {
    if (!(await confirmAdult("Deleting artwork permanently removes its local image files."))) return;
    Alert.alert("Delete this artwork?", "This cannot be undone on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (deleteDrawing(drawing.id)) router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={[styles.navigation, { paddingTop: insets.top + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ARTWORK DETAILS</Text>
          <Text style={styles.navigationTitle} numberOfLines={1}>
            {drawing.title || "Untitled masterpiece"}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close artwork details"
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.imageCard}>
          <Image
            source={{ uri: drawing.uri }}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={drawing.title || "Scanned artwork"}
          />
        </View>

        <View style={styles.metadataLine}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metadataLabel}>Added</Text>
            <Text style={styles.metadataValue}>{artworkDate(drawing.addedAt)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.metadataLabel}>Sketchpad</Text>
            <Text style={styles.metadataValue}>{pad?.name ?? "Buki"}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Story</Text>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setSaved(false);
            }}
            placeholder="Give this artwork a title"
            maxLength={100}
            style={styles.input}
            returnKeyType="done"
          />
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={(value) => {
              setNotes(value);
              setSaved(false);
            }}
            placeholder="What should you remember about it?"
            multiline
            maxLength={2_000}
            textAlignVertical="top"
            style={[styles.input, styles.notesInput]}
          />
          <Pressable
            disabled={!changed}
            onPress={save}
            style={({ pressed }) => [
              styles.primaryButton,
              !changed && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{saved ? "Saved" : "Save details"}</Text>
          </Pressable>
          <Text style={styles.freeNote}>Title, date, and notes are available to every Buki member.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Organize</Text>
              <Text style={styles.sectionCaption}>Favorites and tags are included with Pro.</Text>
            </View>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>

          <Pressable
            onPress={() => toggleFavorite(drawing.id)}
            accessibilityRole="button"
            accessibilityLabel={drawing.favorite ? "Remove from favorites" : "Add to favorites"}
            style={({ pressed }) => [styles.favoriteButton, pressed && styles.pressed]}
          >
            <SymbolView
              name={drawing.favorite ? "heart.fill" : "heart"}
              size={20}
              tintColor={drawing.favorite ? colors.titleCoral : colors.titleTeal}
            />
            <Text style={styles.favoriteLabel}>
              {drawing.favorite ? "Favorite artwork" : "Add to favorites"}
            </Text>
            {!advancedOrganization ? <Text style={styles.lockLabel}>Unlock</Text> : null}
          </Pressable>

          {tags.length ? (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => setDrawingTags(drawing.id, tags.filter((item) => item !== tag))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove tag ${tag}`}
                  style={styles.tag}
                >
                  <Text style={styles.tagText}>{tag}</Text>
                  <Text style={styles.tagRemove}>×</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyTags}>No tags yet.</Text>
          )}

          <View style={styles.tagComposer}>
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              placeholder="Add a tag"
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={addTag}
              style={[styles.input, styles.tagInput]}
            />
            <Pressable onPress={addTag} style={({ pressed }) => [styles.addTagButton, pressed && styles.pressed]}>
              <Text style={styles.addTagLabel}>Add</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => void confirmDelete()}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <Text style={styles.deleteLabel}>Delete artwork</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundDeep },
  navigation: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: { fontSize: 10.5, fontWeight: "900", letterSpacing: 1.1, color: colors.titleCoral },
  navigationTitle: { fontSize: 22, lineHeight: 27, fontWeight: "900", color: colors.ink },
  doneButton: {
    minWidth: 62,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  doneLabel: { fontSize: 16, fontWeight: "800", color: colors.titleTeal },
  content: { padding: 16, gap: 16 },
  imageCard: {
    height: 290,
    padding: 14,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: "100%", height: "100%" },
  metadataLine: { flexDirection: "row", gap: 12, paddingHorizontal: 4 },
  metadataLabel: { fontSize: 11, fontWeight: "800", color: colors.mutedText, textTransform: "uppercase" },
  metadataValue: { fontSize: 14, fontWeight: "800", color: colors.ink, marginTop: 3 },
  sectionCard: {
    padding: 16,
    gap: 10,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: colors.ink },
  sectionCaption: { fontSize: 12, lineHeight: 17, color: colors.mutedText, marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: "800", color: colors.mutedText },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.page,
    color: colors.ink,
    fontSize: 15,
  },
  notesInput: { minHeight: 110 },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 15,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.titleTeal,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  freeNote: { fontSize: 11.5, lineHeight: 16, color: colors.mutedText, textAlign: "center" },
  proBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.bloomYellow },
  proBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7, color: colors.ink },
  favoriteButton: {
    minHeight: 50,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceAlt,
  },
  favoriteLabel: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.ink },
  lockLabel: { fontSize: 11, fontWeight: "900", color: colors.titleCoral },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tag: { minHeight: 34, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 17, backgroundColor: "rgba(72,198,183,0.13)" },
  tagText: { fontSize: 12.5, fontWeight: "800", color: colors.titleTeal },
  tagRemove: { fontSize: 18, lineHeight: 18, color: colors.titleTeal },
  emptyTags: { fontSize: 12, color: colors.mutedText },
  tagComposer: { flexDirection: "row", gap: 8 },
  tagInput: { flex: 1 },
  addTagButton: { minWidth: 66, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  addTagLabel: { fontSize: 14, fontWeight: "900", color: colors.titleTeal },
  deleteButton: { minHeight: 48, borderRadius: 16, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "rgba(180,60,60,0.18)" },
  deleteLabel: { fontSize: 14, fontWeight: "900", color: "#B43C3C" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  missingRoot: { flex: 1, padding: 24, gap: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundDeep },
  missingTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  missingBody: { fontSize: 14, color: colors.mutedText, textAlign: "center" },
});
