import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createSketchpadPdf } from "@/export/sketchpad-pdf";
import { createSketchpadZip } from "@/export/sketchpad-zip";
import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { confirmAdult } from "@/store/parental-gate";
import { useProfiles } from "@/store/profiles";
import type { PadStyle } from "@/store/migrate";
import { colors } from "@/theme";

type ExportKind = "pdf" | "zip";

const STYLE_LABELS: Record<PadStyle, string> = {
  spread: "Open spread",
  vertical: "Portrait pages",
  album: "Landscape album",
  grid: "Four-art grid",
  strip: "Three-art filmstrip",
};

function confirmIncompleteExport(missingCount: number): Promise<boolean> {
  if (missingCount === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    Alert.alert(
      "Some media is unavailable",
      `${missingCount} file${missingCount === 1 ? " is" : "s are"} missing from this device. Buki included placeholders or metadata so the records are not lost. Share this export anyway?`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Share Anyway", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function ExportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pads = useDrawings((state) => state.pads);
  const activePadId = useDrawings((state) => state.activePadId);
  const drawingsByPad = useDrawings((state) => state.drawingsByPad);
  const children = useProfiles((state) => state.children);
  const activeChildId = useProfiles((state) => state.activeChildId);
  const canExport = useMembership((state) => state.capabilities.exportData);
  const requestUpgrade = useMembership((state) => state.requestUpgrade);
  const visiblePads = useMemo(
    () => pads.filter((pad) => pad.childId === activeChildId),
    [activeChildId, pads],
  );
  const [selectedPadId, setSelectedPadId] = useState(activePadId);
  const [busy, setBusy] = useState<ExportKind | null>(null);

  useEffect(() => {
    if (visiblePads.some((pad) => pad.id === selectedPadId)) return;
    setSelectedPadId(visiblePads[0]?.id ?? "");
  }, [selectedPadId, visiblePads]);

  const selectedPad = visiblePads.find((pad) => pad.id === selectedPadId) ?? visiblePads[0];
  const drawings = selectedPad ? drawingsByPad[selectedPad.id] ?? [] : [];
  const childName = children.find((child) => child.id === activeChildId)?.name;

  const exportSketchpad = async (kind: ExportKind) => {
    if (!canExport) {
      requestUpgrade("exportData", kind === "pdf" ? "account_export_pdf" : "account_export_zip");
      return;
    }
    if (!selectedPad) {
      Alert.alert("No sketchpad selected", "Create or select a sketchpad before exporting.");
      return;
    }
    if (!(await confirmAdult(`Exporting ${selectedPad.name} opens Apple’s system share sheet.`))) return;

    setBusy(kind);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device cannot open Apple’s share sheet right now.");
        return;
      }
      const result = kind === "pdf"
        ? await createSketchpadPdf({ pad: selectedPad, drawings, childName })
        : await createSketchpadZip({ pad: selectedPad, drawings, childName });
      if (!(await confirmIncompleteExport(result.missingCount))) return;
      await Sharing.shareAsync(result.uri, {
        mimeType: kind === "pdf" ? "application/pdf" : "application/zip",
        UTI: kind === "pdf" ? "com.adobe.pdf" : "public.zip-archive",
        dialogTitle: result.filename,
      });
    } catch (error) {
      Alert.alert(
        `Could not create ${kind.toUpperCase()} export`,
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.navigation, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.eyebrow}>BUKI PRO</Text>
          <Text style={styles.title}>Export Sketchpad</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close export center"
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 42 }]}>
        <View style={styles.introCard}>
          <Text style={styles.introMark}>↗</Text>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>A portable copy of their creativity</Text>
            <Text style={styles.introDetail}>
              PDF recreates the sketchpad layout. ZIP keeps images, available originals, and complete metadata together.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose a sketchpad</Text>
        <View style={styles.padList}>
          {visiblePads.map((pad) => {
            const selected = pad.id === selectedPad?.id;
            const count = drawingsByPad[pad.id]?.length ?? 0;
            return (
              <Pressable
                key={pad.id}
                onPress={() => setSelectedPadId(pad.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.padCard,
                  selected && styles.padCardSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.coverSwatch, { backgroundColor: pad.coverColor }]} />
                <View style={styles.padCopy}>
                  <Text style={styles.padName}>{pad.name}</Text>
                  <Text style={styles.padDetail}>{STYLE_LABELS[pad.style]} · {count} artwork{count === 1 ? "" : "s"}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>

        {!canExport ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedTitle}>Exports are a Buki Pro feature</Text>
            <Text style={styles.lockedDetail}>Your local artwork stays available. Upgrade to create files you can save or share.</Text>
            <Pressable
              onPress={() => requestUpgrade("exportData", "export_center")}
              style={({ pressed }) => [styles.proButton, pressed && styles.pressed]}
            >
              <Text style={styles.proButtonLabel}>See Buki Pro</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.exportGrid}>
            <ExportCard
              badge="PDF"
              title="Sketchpad PDF"
              detail="A print-ready book that follows the selected spread, page, grid, or strip layout."
              busy={busy === "pdf"}
              disabled={busy !== null || !selectedPad}
              onPress={() => void exportSketchpad("pdf")}
            />
            <ExportCard
              badge="ZIP"
              title="Images + metadata"
              detail="Transparent images, available originals, JSON, CSV, and missing-media records."
              busy={busy === "zip"}
              disabled={busy !== null || !selectedPad}
              onPress={() => void exportSketchpad("zip")}
            />
          </View>
        )}

        <Text style={styles.privacyNote}>
          Nothing is uploaded to create these files. Buki prepares exports locally, then Apple controls where you share them.
        </Text>
      </ScrollView>
    </View>
  );
}

function ExportCard({
  badge,
  title,
  detail,
  busy,
  disabled,
  onPress,
}: {
  badge: string;
  title: string;
  detail: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.exportCard, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={styles.fileBadge}><Text style={styles.fileBadgeText}>{badge}</Text></View>
      <Text style={styles.exportTitle}>{title}</Text>
      <Text style={styles.exportDetail}>{detail}</Text>
      <View style={styles.exportAction}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.exportActionLabel}>Create & Share</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  navigation: {
    minHeight: 92,
    paddingHorizontal: 22,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  eyebrow: { color: colors.titleCoral, fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  title: { marginTop: 3, color: colors.ink, fontSize: 28, fontWeight: "800" },
  doneButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.surfaceAlt },
  doneLabel: { color: colors.titleTeal, fontSize: 16, fontWeight: "800" },
  content: { padding: 20, gap: 18 },
  introCard: { flexDirection: "row", gap: 14, padding: 18, borderRadius: 24, backgroundColor: colors.titleTeal },
  introMark: { color: colors.bloomYellow, fontSize: 30, fontWeight: "900" },
  introCopy: { flex: 1, gap: 5 },
  introTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  introDetail: { color: "rgba(255,255,255,.82)", fontSize: 14, lineHeight: 20 },
  sectionTitle: { marginTop: 3, color: colors.mutedText, fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  padList: { gap: 10 },
  padCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13, padding: 13, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  padCardSelected: { borderColor: colors.titleTeal, backgroundColor: "#F1FBF8" },
  coverSwatch: { width: 44, height: 52, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,.7)" },
  padCopy: { flex: 1, gap: 3 },
  padName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  padDetail: { color: colors.mutedText, fontSize: 13 },
  radio: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 2, borderColor: "rgba(40,67,90,.25)" },
  radioSelected: { borderColor: colors.titleTeal },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.titleTeal },
  exportGrid: { gap: 13 },
  exportCard: { padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: "#6B5A48", shadowOpacity: 0.08, shadowRadius: 13, shadowOffset: { width: 0, height: 5 } },
  fileBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.backgroundDeep },
  fileBadgeText: { color: colors.titleCoral, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  exportTitle: { marginTop: 14, color: colors.ink, fontSize: 20, fontWeight: "800" },
  exportDetail: { marginTop: 5, color: colors.mutedText, fontSize: 14, lineHeight: 20 },
  exportAction: { minHeight: 44, marginTop: 16, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.fab },
  exportActionLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  lockedCard: { gap: 8, padding: 20, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  lockedTitle: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  lockedDetail: { color: colors.mutedText, fontSize: 14, lineHeight: 20 },
  proButton: { minHeight: 46, marginTop: 8, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.titleTeal },
  proButtonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  privacyNote: { paddingHorizontal: 8, color: colors.mutedText, fontSize: 12, lineHeight: 18, textAlign: "center" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});
