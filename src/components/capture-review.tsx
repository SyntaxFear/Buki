import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FlipPad } from "@/components/flip-pad";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { Scrapbook } from "@/components/scrapbook";
import type { Drawing, Sketchpad } from "@/store/drawings";
import { colors } from "@/theme";
import type { ReviewCutout } from "@/utils/capture-review-media";
import {
  captureReviewRetryLabel,
  captureReviewTargetUnit,
  type CaptureReviewSource,
} from "@/utils/capture-review";
import { getBookLayout, getPadPageLayout } from "@/utils/book-layout";

export interface CaptureReviewCandidate extends ReviewCutout {
  rotation: number;
}

interface Props {
  pad: Sketchpad;
  drawings: Drawing[];
  candidate: CaptureReviewCandidate;
  source: CaptureReviewSource;
  accepting: boolean;
  onAccept: () => void;
  onRetake: () => void;
  onDelete: () => void;
}

export function CaptureReview({
  pad,
  drawings,
  candidate,
  source,
  accepting,
  onAccept,
  onRetake,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const flipAnim = useSharedValue(0);
  const flipDirection = useSharedValue(0);
  const flipCurl = useSharedValue(0.82);
  const previewDrawings = useMemo<Drawing[]>(
    () => [
      ...drawings,
      {
        id: "capture-review",
        uri: candidate.uri,
        width: candidate.width,
        height: candidate.height,
        rotation: candidate.rotation,
        addedAt: 0,
        photoUri: candidate.photoUri,
      },
    ],
    [candidate, drawings],
  );
  const targetUnit = captureReviewTargetUnit(drawings.length, pad.style);
  const headerBottom = insets.top + 104;
  const controlsReserve = insets.bottom + (height < 720 ? 210 : 190);
  const spreadLayout = useMemo(
    () => getBookLayout(width, height, headerBottom),
    [headerBottom, height, width],
  );
  const pageLayout = useMemo(
    () =>
      getPadPageLayout(
        pad.style === "spread" ? "vertical" : pad.style,
        width,
        height,
        headerBottom,
        controlsReserve,
      ),
    [controlsReserve, headerBottom, height, pad.style, width],
  );
  const retryLabel = captureReviewRetryLabel(source);

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.eyebrow}>CHECK THE SKETCHPAD</Text>
        <Text style={styles.title}>Does this look right?</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Review the crop and placement in {pad.name}.
        </Text>
      </View>

      {pad.style === "spread" ? (
        <Scrapbook
          layout={spreadLayout}
          drawings={previewDrawings}
          spread={targetUnit}
          flip={null}
          flipAnim={flipAnim}
          flipDirection={flipDirection}
          flipCurl={flipCurl}
          coverColor={pad.coverColor}
          pageColor={pad.pageColor}
          design={pad.design}
          border={pad.border}
          decoration={pad.decoration}
        />
      ) : (
        <FlipPad
          style={pad.style}
          layout={pageLayout}
          drawings={previewDrawings}
          page={targetUnit}
          flip={null}
          flipAnim={flipAnim}
          flipDirection={flipDirection}
          flipCurl={flipCurl}
          coverColor={pad.coverColor}
          pageColor={pad.pageColor}
          design={pad.design}
          border={pad.border}
          decoration={pad.decoration}
        />
      )}

      <View
        style={[
          styles.actions,
          { paddingBottom: Math.max(18, insets.bottom + 10) },
        ]}
      >
        <Pressable
          disabled={accepting}
          onPress={onAccept}
          haptic="medium"
          accessibilityRole="button"
          accessibilityLabel="Add drawing to sketchpad"
          accessibilityState={{ disabled: accepting, busy: accepting }}
          style={({ pressed }) => [
            styles.primaryButton,
            accepting && styles.disabled,
            pressed && !accepting && styles.pressed,
          ]}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#FFF7EE" />
          ) : (
            <SymbolView name="checkmark" size={18} tintColor="#FFF7EE" />
          )}
          <Text style={styles.primaryLabel}>
            {accepting ? "Adding…" : "Add to sketchpad"}
          </Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            disabled={accepting}
            onPress={onRetake}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            accessibilityState={{ disabled: accepting }}
            style={({ pressed }) => [
              styles.secondaryButton,
              accepting && styles.disabled,
              pressed && !accepting && styles.pressed,
            ]}
          >
            <SymbolView
              name="arrow.counterclockwise"
              size={17}
              tintColor={colors.titleTeal}
            />
            <Text style={styles.secondaryLabel}>{retryLabel}</Text>
          </Pressable>

          <Pressable
            disabled={accepting}
            onPress={onDelete}
            haptic="warning"
            accessibilityRole="button"
            accessibilityLabel="Delete captured image"
            accessibilityHint="Discards this capture and returns to the sketchpad"
            accessibilityState={{ disabled: accepting }}
            style={({ pressed }) => [
              styles.deleteButton,
              accepting && styles.disabled,
              pressed && !accepting && styles.pressed,
            ]}
          >
            <SymbolView name="trash.fill" size={17} tintColor="#B9443A" />
            <Text style={styles.deleteLabel}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    position: "absolute",
    zIndex: 10,
    left: 22,
    right: 22,
    alignItems: "center",
  },
  eyebrow: {
    color: colors.titleCoral,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
    marginTop: 2,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 2,
    maxWidth: 330,
  },
  actions: {
    position: "absolute",
    zIndex: 20,
    left: 16,
    right: 16,
    bottom: 0,
    padding: 12,
    gap: 10,
    borderRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: "rgba(255,253,247,0.97)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: colors.fab,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryLabel: {
    color: "#FFF7EE",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryLabel: {
    color: colors.titleTeal,
    fontSize: 14.5,
    fontWeight: "800",
  },
  deleteButton: {
    minWidth: 104,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#FCE8E3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  deleteLabel: {
    color: "#A93D35",
    fontSize: 14.5,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.55,
  },
});
