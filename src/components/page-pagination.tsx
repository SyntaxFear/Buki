import { StyleSheet, Text, View } from "react-native";

import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { getPadDesign, type PadDesignId } from "@/pad-designs";
import type { PadStyle } from "@/store/drawings";
import { colors } from "@/theme";
import {
  pagePaginationState,
  paginationMarkers,
} from "@/utils/page-pagination";

interface Props {
  currentUnit: number;
  drawingCount: number;
  style: PadStyle;
  top: number;
  coverColor?: string;
  design?: PadDesignId;
  disabled?: boolean;
  onSelectUnit: (unit: number) => void;
}

export function PagePagination({
  currentUnit,
  drawingCount,
  style,
  top,
  coverColor,
  design,
  disabled = false,
  onSelectUnit,
}: Props) {
  const palette = getPadDesign(design, coverColor);
  const state = pagePaginationState(drawingCount, style, currentUnit);
  const markers = paginationMarkers(state.currentUnit, state.totalUnits);
  const visibleFilledLabel =
    state.filledPages === 0 ? "Empty" : `${state.filledPages} filled`;
  const spokenFilledLabel = `${state.filledPages} ${state.filledPages === 1 ? "page" : "pages"} filled`;
  const spokenUnitName = state.unitName === "spread" ? "Spread" : "Page";

  return (
    <View pointerEvents="box-none" style={[styles.positioner, { top }]}>
      <View style={styles.pill}>
        <Text
          accessible
          accessibilityLabel={spokenFilledLabel}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={styles.filledText}
        >
          {visibleFilledLabel}
        </Text>
        <View style={styles.separator} />
        <View style={styles.markers}>
          {markers.map((marker) => {
            if (typeof marker !== "number") {
              return (
                <Text
                  key={marker}
                  maxFontSizeMultiplier={1.2}
                  style={styles.gap}
                >
                  ···
                </Text>
              );
            }

            const active = marker === state.currentUnit;
            const filled = marker < state.filledUnits;
            const pageNumber = marker + 1;
            const markerDisabled = disabled || active;
            return (
              <Pressable
                key={marker}
                haptic={false}
                testID={`page-marker-${pageNumber}`}
                disabled={markerDisabled}
                onPress={() => onSelectUnit(marker)}
                accessibilityRole="button"
                accessibilityLabel={`${spokenUnitName} ${pageNumber} of ${state.totalUnits}`}
                accessibilityHint={
                  active
                    ? undefined
                    : `Turns to ${spokenUnitName.toLowerCase()} ${pageNumber}`
                }
                accessibilityState={{
                  selected: active,
                  disabled: markerDisabled,
                }}
                style={({ pressed }) => [
                  styles.markerButton,
                  pressed && styles.markerButtonPressed,
                ]}
              >
                <View
                  style={[
                    styles.markerFrame,
                    filled
                      ? {
                          borderColor: `${palette.ring}66`,
                          backgroundColor: `${palette.ring}18`,
                        }
                      : {
                          borderColor: `${palette.coverDark}26`,
                          backgroundColor: colors.surface,
                        },
                    active && {
                      borderColor: palette.coverDark,
                      backgroundColor: palette.ring,
                    },
                  ]}
                >
                  <Text
                    testID={`page-number-${pageNumber}`}
                    maxFontSizeMultiplier={1.2}
                    style={[
                      styles.markerNumber,
                      {
                        color: active
                          ? colors.surface
                          : filled
                            ? palette.coverDark
                            : colors.mutedText,
                      },
                    ]}
                  >
                    {pageNumber}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    alignItems: "center",
  },
  pill: {
    minHeight: 34,
    maxWidth: "94%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,253,247,0.94)",
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0 3px 10px rgba(83, 65, 45, 0.12)",
  },
  filledText: {
    flexShrink: 0,
    color: colors.mutedText,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  separator: {
    width: 1,
    height: 16,
    alignSelf: "center",
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  markers: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  markerButton: {
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  markerButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.88 }],
  },
  markerFrame: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 3,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  markerNumber: {
    fontFamily: "PatrickHand",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  gap: {
    width: 11,
    color: colors.mutedText,
    fontFamily: "PatrickHand",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
  },
});
