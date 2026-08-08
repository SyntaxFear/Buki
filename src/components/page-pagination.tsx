import { StyleSheet, Text, View } from "react-native";

import { getPadDesign, type PadDesignId } from "@/pad-designs";
import type { PadStyle } from "@/store/drawings";
import { colors } from "@/theme";
import { pagePaginationState, paginationMarkers } from "@/utils/page-pagination";

interface Props {
  currentUnit: number;
  drawingCount: number;
  style: PadStyle;
  top: number;
  coverColor?: string;
  design?: PadDesignId;
}

export function PagePagination({
  currentUnit,
  drawingCount,
  style,
  top,
  coverColor,
  design,
}: Props) {
  const palette = getPadDesign(design, coverColor);
  const state = pagePaginationState(drawingCount, style, currentUnit);
  const markers = paginationMarkers(state.currentUnit, state.totalUnits);
  const visibleFilledLabel = state.filledPages === 0 ? "Empty" : `${state.filledPages} filled`;
  const spokenFilledLabel = `${state.filledPages} ${state.filledPages === 1 ? "page" : "pages"} filled`;
  const spokenUnitName = state.unitName === "spread" ? "Spread" : "Page";

  return (
    <View
      pointerEvents="none"
      style={[styles.positioner, { top }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${spokenUnitName} ${state.currentUnit + 1} of ${state.totalUnits}. ${spokenFilledLabel}.`}
    >
      <View style={styles.pill}>
        <Text style={styles.filledText}>{visibleFilledLabel}</Text>
        <View style={styles.separator} />
        <View style={styles.markers}>
          {markers.map((marker) => {
            if (typeof marker !== "number") {
              return (
                <Text key={marker} style={styles.gap}>
                  ···
                </Text>
              );
            }

            const active = marker === state.currentUnit;
            const filled = marker < state.filledUnits;
            return (
              <View
                key={marker}
                style={[
                  styles.markerFrame,
                  active && {
                    borderColor: palette.ring,
                    backgroundColor: `${palette.ring}24`,
                  },
                ]}
              >
                <View
                  style={[
                    styles.marker,
                    filled
                      ? { backgroundColor: palette.ring }
                      : { backgroundColor: colors.surface, borderColor: palette.ring },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <Text style={[styles.pageText, { color: palette.coverDark }]}>
          {state.currentUnit + 1}/{state.totalUnits}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    minHeight: 30,
    maxWidth: "86%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,253,247,0.94)",
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0 3px 10px rgba(83, 65, 45, 0.12)",
  },
  filledText: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  separator: {
    width: 1,
    height: 13,
    backgroundColor: colors.border,
  },
  markers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  markerFrame: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  marker: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  gap: {
    width: 13,
    color: colors.mutedText,
    fontSize: 9,
    lineHeight: 10,
    textAlign: "center",
  },
  pageText: {
    minWidth: 24,
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
});
