import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ViewShot, { captureRef, type ViewShotRef } from "react-native-view-shot";

import {
  artworkExportFilename,
  copyArtworkExport,
  type ArtworkImageExport,
} from "@/export/artwork-export";
import { requireExportAccess } from "@/export/export-access";
import type { Drawing } from "@/store/drawings";
import { confirmAdult } from "@/store/parental-gate";
import { colors } from "@/theme";
import { useAuth } from "@/store/auth";
import { trackAnalyticsEvent } from "@/analytics/client";

interface Props {
  visible: boolean;
  drawing: Drawing;
  padName: string;
  childName?: string;
  onClose: () => void;
}

const FORMAT_LABELS: Record<ArtworkImageExport, { title: string; detail: string }> = {
  png: { title: "PNG", detail: "Transparent cutout" },
  jpg: { title: "JPG", detail: "White background" },
  card: { title: "Share card", detail: "Decorated presentation" },
};

function displayDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ArtworkExportSheet({ visible, drawing, padName, childName, onClose }: Props) {
  const ownerId = useAuth((state) => state.user?.id ?? null);
  const previewRef = useRef<ViewShotRef>(null);
  const [format, setFormat] = useState<ArtworkImageExport>("card");
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFormat("card");
    setPreviewReady(false);
    setBusy(null);
  }, [visible, drawing.id]);

  useEffect(() => {
    setPreviewReady(format === "png");
  }, [format]);

  const prepareFile = async (): Promise<string> => {
    requireExportAccess(`artwork_${format}_prepare`);
    if (format === "png") return copyArtworkExport(drawing.uri, drawing, "png");
    if (!previewReady || !previewRef.current) {
      throw new Error("The export preview is still loading.");
    }
    const ratio = format === "card" ? 4 / 5 : Math.max(0.55, Math.min(1.8, drawing.width / drawing.height));
    const width = 1600;
    const uri = await captureRef(previewRef, {
      format: format === "jpg" ? "jpg" : "png",
      quality: 0.96,
      result: "tmpfile",
      width,
      height: Math.round(width / ratio),
      useRenderInContext: true,
    });
    return copyArtworkExport(uri, drawing, format);
  };

  const share = async () => {
    if (!(await confirmAdult("Sharing artwork opens Apple’s system share sheet."))) return;
    setBusy("share");
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device cannot open the share sheet right now.");
        return;
      }
      const uri = await prepareFile();
      await Sharing.shareAsync(uri, {
        mimeType: format === "jpg" ? "image/jpeg" : "image/png",
        UTI: format === "jpg" ? "public.jpeg" : "public.png",
        dialogTitle: artworkExportFilename(drawing, format),
      });
      void trackAnalyticsEvent(ownerId, {
        name: "export_used",
        source: "share_sheet",
        feature: "exportData",
        exportKind: format === "card" ? "share_card" : format,
        result: "success",
      });
    } catch (error) {
      Alert.alert("Could not export artwork", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!(await confirmAdult("Saving artwork adds an image to the adult device’s Photos library."))) return;
    setBusy("save");
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          "Photos permission needed",
          "Allow Buki to add exported artwork to Photos, or use Share instead.",
        );
        return;
      }
      const uri = await prepareFile();
      await MediaLibrary.Asset.create(uri);
      void trackAnalyticsEvent(ownerId, {
        name: "export_used",
        source: "save_to_photos",
        feature: "exportData",
        exportKind: format === "card" ? "share_card" : format,
        result: "success",
      });
      Alert.alert("Saved to Photos", artworkExportFilename(drawing, format));
    } catch (error) {
      Alert.alert("Could not save artwork", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const captureDisabled = format !== "png" && !previewReady;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.navigation}>
          <View>
            <Text style={styles.eyebrow}>BUKI PRO EXPORT</Text>
            <Text style={styles.title}>Export artwork</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close artwork export"
            style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
          >
            <Text style={styles.doneLabel}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <View style={styles.formatRow}>
            {(Object.keys(FORMAT_LABELS) as ArtworkImageExport[]).map((item) => (
              <Pressable
                key={item}
                onPress={() => setFormat(item)}
                accessibilityRole="radio"
                accessibilityLabel={`${FORMAT_LABELS[item].title}, ${FORMAT_LABELS[item].detail}`}
                accessibilityHint="Selects this artwork export format"
                accessibilityState={{ selected: format === item }}
                style={({ pressed }) => [
                  styles.formatCard,
                  format === item && styles.formatCardSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.formatTitle}>{FORMAT_LABELS[item].title}</Text>
                <Text style={styles.formatDetail}>{FORMAT_LABELS[item].detail}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.previewShell}>
            {format === "png" ? (
              <View style={styles.transparentPreview}>
                <Image source={{ uri: drawing.uri }} style={styles.previewImage} contentFit="contain" />
              </View>
            ) : (
              <ViewShot
                ref={previewRef}
                key={format}
                style={[
                  styles.captureCanvas,
                  format === "card" ? styles.cardCanvas : { aspectRatio: Math.max(0.55, Math.min(1.8, drawing.width / drawing.height)) },
                ]}
              >
                {format === "jpg" ? (
                  <Image
                    source={{ uri: drawing.uri }}
                    style={styles.previewImage}
                    contentFit="contain"
                    onLoad={() => setPreviewReady(true)}
                  />
                ) : (
                  <>
                    <View style={styles.cardBlobOne} />
                    <View style={styles.cardBlobTwo} />
                    <View style={styles.cardWordmarkRow}>
                      <Text style={styles.cardWordmark}>Buki</Text>
                      <Text style={styles.cardDate}>{displayDate(drawing.addedAt)}</Text>
                    </View>
                    <View style={styles.cardArtworkMat}>
                      <Image
                        source={{ uri: drawing.uri }}
                        style={styles.previewImage}
                        contentFit="contain"
                        onLoad={() => setPreviewReady(true)}
                      />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {drawing.title || "A little masterpiece"}
                    </Text>
                    <Text style={styles.cardByline} numberOfLines={1}>
                      {childName ? `${childName} · ` : ""}{padName}
                    </Text>
                  </>
                )}
              </ViewShot>
            )}
          </View>

          <Text style={styles.fileName} selectable>
            {artworkExportFilename(drawing, format)}
          </Text>
          <Text style={styles.caption}>
            PNG preserves the transparent cutout. JPG adds a white background. Share card creates a polished keepsake with the title and date.
          </Text>

          <View style={styles.actions}>
            <Pressable
              disabled={Boolean(busy) || captureDisabled}
              onPress={() => void share()}
              accessibilityRole="button"
              accessibilityLabel={`Share ${FORMAT_LABELS[format].title} artwork export`}
              accessibilityHint="Opens Apple’s system share sheet after adult confirmation"
              accessibilityState={{ disabled: Boolean(busy) || captureDisabled, busy: busy === "share" }}
              style={({ pressed }) => [styles.primaryButton, (busy || captureDisabled) && styles.disabled, pressed && styles.pressed]}
            >
              {busy === "share" ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryLabel}>Share</Text>}
            </Pressable>
            <Pressable
              disabled={Boolean(busy) || captureDisabled}
              onPress={() => void save()}
              accessibilityRole="button"
              accessibilityLabel={`Save ${FORMAT_LABELS[format].title} artwork export to Photos`}
              accessibilityHint="Adds the exported image to the adult device’s Photos library after confirmation"
              accessibilityState={{ disabled: Boolean(busy) || captureDisabled, busy: busy === "save" }}
              style={({ pressed }) => [styles.secondaryButton, (busy || captureDisabled) && styles.disabled, pressed && styles.pressed]}
            >
              {busy === "save" ? <ActivityIndicator color={colors.titleTeal} /> : <Text style={styles.secondaryLabel}>Save to Photos</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundDeep },
  navigation: { minHeight: 78, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { fontSize: 10.5, fontWeight: "900", letterSpacing: 1.1, color: colors.titleCoral },
  title: { fontSize: 25, lineHeight: 30, fontWeight: "900", color: colors.ink },
  doneButton: { minWidth: 62, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  doneLabel: { fontSize: 16, fontWeight: "800", color: colors.titleTeal },
  content: { padding: 16, paddingBottom: 44, gap: 15 },
  formatRow: { flexDirection: "row", gap: 8 },
  formatCard: { flex: 1, minWidth: 0, minHeight: 72, padding: 10, borderRadius: 16, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  formatCardSelected: { borderWidth: 2, borderColor: colors.titleTeal, backgroundColor: "#F1FBF8" },
  formatTitle: { fontSize: 13.5, fontWeight: "900", color: colors.ink, textAlign: "center" },
  formatDetail: { marginTop: 3, fontSize: 9.5, lineHeight: 12, color: colors.mutedText, textAlign: "center" },
  previewShell: { minHeight: 390, padding: 16, borderRadius: 24, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  transparentPreview: { width: "100%", maxWidth: 330, aspectRatio: 4 / 5, borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#EAE7E0", borderWidth: 10, borderColor: "#F7F4EE" },
  captureCanvas: { width: "100%", maxWidth: 330, overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  cardCanvas: { aspectRatio: 4 / 5, padding: 22, justifyContent: "flex-start", backgroundColor: "#FFF8EA" },
  previewImage: { width: "100%", height: "100%" },
  cardWordmarkRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 2 },
  cardWordmark: { fontSize: 28, fontWeight: "900", color: colors.titleTeal },
  cardDate: { fontSize: 10.5, fontWeight: "800", color: colors.mutedText },
  cardArtworkMat: { width: "100%", flex: 1, marginTop: 14, padding: 14, borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(40,67,90,0.12)", zIndex: 2 },
  cardTitle: { width: "100%", marginTop: 14, fontSize: 21, lineHeight: 25, fontWeight: "900", color: colors.ink, textAlign: "center", zIndex: 2 },
  cardByline: { width: "100%", marginTop: 5, fontSize: 11.5, fontWeight: "800", color: colors.titleCoral, textAlign: "center", zIndex: 2 },
  cardBlobOne: { position: "absolute", width: 150, height: 150, borderRadius: 75, left: -55, bottom: -50, backgroundColor: "rgba(72,198,183,0.22)" },
  cardBlobTwo: { position: "absolute", width: 130, height: 130, borderRadius: 65, right: -48, top: -52, backgroundColor: "rgba(255,118,94,0.18)" },
  fileName: { fontSize: 12, fontWeight: "800", color: colors.ink, textAlign: "center" },
  caption: { fontSize: 12, lineHeight: 17, color: colors.mutedText, textAlign: "center", paddingHorizontal: 6 },
  actions: { gap: 9 },
  primaryButton: { minHeight: 52, borderRadius: 17, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.titleTeal },
  primaryLabel: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "900" },
  secondaryButton: { minHeight: 50, borderRadius: 17, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  secondaryLabel: { color: colors.titleTeal, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
