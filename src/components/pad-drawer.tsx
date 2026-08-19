import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BukiWordmark } from "@/components/buki-wordmark";
import { Glass } from "@/components/glass";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { NativeToolbarButton } from "@/components/native-toolbar-button";
import {
  artworkCountLabel,
  childContentSummary,
} from "@/layouts/child-content-counts";
import { drawerChildGroups } from "@/layouts/drawer-child-groups";
import { useAuth } from "@/store/auth";
import { useDrawings, type PadStyle, type Sketchpad } from "@/store/drawings";
import { useProfiles } from "@/store/profiles";
import {
  getPadDesign,
  PAD_DESIGNS,
  type PadDesignId,
  type PadStamp,
} from "@/pad-designs";
import {
  type PadBorderId,
  type PadDecorationId,
  type PadVisualOption,
} from "@/pad-visuals";
import { getPadIcon } from "@/pad-icons";
import { confirmAdult } from "@/store/parental-gate";
import { colors } from "@/theme";

interface Props {
  onClose: () => void;
}

const DRAWER_TEXT_SCALE = 1.35;
const SKETCHPAD_ROW_RADIUS = 16;
const SKETCHPAD_ICON_INSET = 8;
const SKETCHPAD_ICON_RADIUS =
  SKETCHPAD_ROW_RADIUS - SKETCHPAD_ICON_INSET;

export const STYLE_LABEL: Record<PadStyle, string> = {
  spread: "Spread book",
  vertical: "Vertical pad",
  album: "Album",
  grid: "Photo grid",
  strip: "Filmstrip",
};

export function PadDrawerContent({ onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const allPads = useDrawings((s) => s.pads);
  const children = useProfiles((s) => s.children);
  const activeChildId = useProfiles((s) => s.activeChildId);
  const setActiveChild = useProfiles((s) => s.setActiveChild);
  const activePadId = useDrawings((s) => s.activePadId);
  const drawingsByPad = useDrawings((s) => s.drawingsByPad);
  const setActivePad = useDrawings((s) => s.setActivePad);
  const renamePad = useDrawings((s) => s.renamePad);
  const deletePad = useDrawings((s) => s.deletePad);
  const adultProfile = useAuth((s) => s.profile);
  const [childFilterId, setChildFilterId] = useState<string | null>(null);
  const effectiveChildFilterId = children.some(
    (child) => child.id === childFilterId,
  )
    ? childFilterId
    : null;
  const allChildGroups = useMemo(
    () => drawerChildGroups(children, allPads, drawingsByPad, null),
    [allPads, children, drawingsByPad],
  );
  const childGroups = useMemo(
    () =>
      effectiveChildFilterId === null
        ? allChildGroups
        : allChildGroups.filter(
            (group) => group.child.id === effectiveChildFilterId,
          ),
    [allChildGroups, effectiveChildFilterId],
  );
  const activeChild = children.find((child) => child.id === activeChildId);

  const openNewSketchpad = () => {
    // Keep the drawer mounted beneath the form sheet so dismissing the editor
    // returns the user to the sketchpad list instead of an empty book canvas.
    router.push({
      pathname: "/sketchpad-editor",
      params: { mode: "create" },
    });
  };

  const openSketchpadEditor = (id: string) => {
    router.push({
      pathname: "/sketchpad-editor",
      params: { id, mode: "edit" },
    });
  };

  const openLibrary = () => {
    onClose();
    router.push("/library");
  };

  const openAccount = () => {
    onClose();
    router.push("/account");
  };

  const managePad = (pad: Sketchpad) => {
    const childPads = allPads.filter((item) => item.childId === pad.childId);
    Alert.alert(pad.name, undefined, [
      {
        text: "Rename",
        onPress: () => {
          Alert.prompt(
            "Rename sketchpad",
            undefined,
            (name) => {
              if (name) renamePad(pad.id, name);
            },
            "plain-text",
            pad.name,
          );
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (childPads.length <= 1) {
            Alert.alert("Can't delete", "This is your only sketchpad.");
            return;
          }
          const count = (drawingsByPad[pad.id] ?? []).length;
          void (async () => {
            if (
              !(await confirmAdult(
                "Deleting a sketchpad permanently removes its local artwork.",
              ))
            )
              return;
            Alert.alert(
              `Delete “${pad.name}”?`,
              count > 0
                ? `Its ${artworkCountLabel(count)} will be deleted too.`
                : undefined,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deletePad(pad.id),
                },
              ],
            );
          })();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const selectChild = (childId: string) => {
    setChildFilterId(childId);
    void setActiveChild(childId);
  };

  const selectPad = (pad: Sketchpad) => {
    void (async () => {
      if (pad.childId !== activeChildId) {
        const selected = await setActiveChild(pad.childId);
        if (!selected) return;
      }
      setActivePad(pad.id);
      onClose();
    })();
  };

  const renderPadRow = (pad: Sketchpad) => {
    const count = (drawingsByPad[pad.id] ?? []).length;
    const active = pad.id === activePadId;
    const design = getPadDesign(pad.design, pad.coverColor);
    const icon = getPadIcon(pad.icon);
    return (
      <View
        key={pad.id}
        style={[
          styles.row,
          active && styles.rowActive,
          active && {
            backgroundColor: design.paper,
            borderColor: design.cover,
          },
        ]}
      >
        <Pressable
          haptic={active ? false : "selection"}
          onPress={() => selectPad(pad)}
          onLongPress={() => managePad(pad)}
          accessibilityRole="button"
          accessibilityLabel={`${pad.name}, ${icon.name} icon, ${design.name}, ${STYLE_LABEL[pad.style]}, ${artworkCountLabel(count)}`}
          accessibilityHint="Selects this child and sketchpad. Long-press to rename or delete it."
          accessibilityState={{ selected: active }}
          style={({ pressed }) => [
            styles.rowMain,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={styles.coverStatusWrap}>
            <View
              style={[
                styles.coverTile,
                {
                  backgroundColor: design.paper,
                  borderColor: active ? design.cover : colors.border,
                },
              ]}
            >
              {icon.id === "cover" ? (
                <MiniCover
                  style={pad.style}
                  design={pad.design}
                  color={pad.coverColor}
                  pageColor={pad.pageColor}
                  border={pad.border}
                  decoration={pad.decoration}
                  scale={0.78}
                />
              ) : (
                <SymbolView
                  name={icon.symbol}
                  size={22}
                  tintColor={design.coverDark}
                  weight="semibold"
                />
              )}
            </View>
            {active ? (
              <View
                pointerEvents="none"
                style={[
                  styles.currentMarker,
                  {
                    backgroundColor: design.cover,
                    borderColor: design.paper,
                  },
                ]}
              >
                <SymbolView
                  name="checkmark"
                  size={9}
                  tintColor="#FFFDF4"
                  weight="bold"
                />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={styles.rowName}
              numberOfLines={1}
              maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            >
              {pad.name}
            </Text>
            <Text
              style={styles.rowMeta}
              numberOfLines={1}
              maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            >
              {design.name} · {artworkCountLabel(count)}
            </Text>
          </View>
        </Pressable>
        <NativeToolbarButton
          label={`Edit ${pad.name}`}
          hint="Edits this sketchpad's name, layout, theme, paper, border, and decorations."
          icon="pencil"
          variant="prominent"
          size="compact"
          tintColor={design.coverDark}
          foregroundColor="#FFFDF4"
          onPress={() => openSketchpadEditor(pad.id)}
          testID={`edit-sketchpad-${pad.id}`}
          style={styles.editButton}
        />
      </View>
    );
  };

  return (
    <View
      testID="pad-drawer-root"
      accessibilityViewIsModal
      style={[
        styles.panel,
        {
          paddingTop: insets.top + 18,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            style={styles.headingEyebrow}
          >
            SKETCHPAD SHELF
          </Text>
          <BukiWordmark fontSize={44} style={styles.brand} />
        </View>
        <Glass
          tint={colors.surface}
          fallbackColor={colors.surfaceAlt}
          style={styles.closeButton}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sketchpads"
            testID="pad-drawer-close-button"
            style={({ pressed }) => [
              StyleSheet.absoluteFill,
              styles.glassIconTouchable,
              pressed && styles.rowPressed,
            ]}
          >
            <SymbolView
              name="xmark"
              size={15}
              weight="semibold"
              tintColor={colors.ink}
            />
          </Pressable>
        </Glass>
      </View>

      <Pressable
        onPress={openNewSketchpad}
        accessibilityRole="button"
        accessibilityLabel="Create a new sketchpad"
        style={({ pressed }) => [
          styles.newRow,
          styles.newRowTop,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={styles.newIcon}>
          <SymbolView name="plus" size={18} tintColor={colors.titleCoral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            style={[styles.rowName, { color: colors.titleCoral }]}
          >
            New sketchpad
          </Text>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            style={styles.rowMeta}
          >
            {activeChild ? `For ${activeChild.name} · ` : ""}Choose its name,
            layout, theme, paper, and details
          </Text>
        </View>
        <SymbolView
          name="chevron.right"
          size={13}
          tintColor={colors.mutedText}
        />
      </Pressable>

      <View style={styles.quickActionRow}>
        <Pressable
          onPress={openLibrary}
          accessibilityRole="button"
          accessibilityLabel="Open art library"
          style={({ pressed }) => [
            styles.quickAction,
            pressed && styles.rowPressed,
          ]}
        >
          <View
            style={[
              styles.quickActionIcon,
              { backgroundColor: "rgba(22,125,130,0.10)" },
            ]}
          >
            <SymbolView
              name="square.grid.2x2.fill"
              size={18}
              tintColor={colors.titleTeal}
            />
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            style={styles.quickActionTitle}
          >
            Art library
          </Text>
        </Pressable>

        <Pressable
          onPress={openAccount}
          accessibilityRole="button"
          accessibilityLabel="Open Adult Account"
          style={({ pressed }) => [
            styles.quickAction,
            pressed && styles.rowPressed,
          ]}
        >
          <View
            style={[
              styles.quickActionIcon,
              { backgroundColor: "rgba(255,118,94,0.11)" },
            ]}
          >
            <Text style={styles.quickActionAvatar}>
              {adultProfile?.avatarUri?.startsWith("emoji:")
                ? adultProfile.avatarUri.slice("emoji:".length)
                : adultProfile?.displayName.trim().charAt(0).toUpperCase() ||
                  "P"}
            </Text>
          </View>
          <Text
            style={styles.quickActionTitle}
            numberOfLines={1}
            maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
          >
            Adult Account
          </Text>
        </Pressable>
      </View>

      <View style={styles.childFilterHeading}>
        <Text
          maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
          style={[styles.listLabel, styles.childFilterLabel]}
        >
          Children
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
          style={styles.childFilterHint}
        >
          Select or filter
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.childFilterContent}
        style={styles.childFilterScroll}
      >
        <Pressable
          haptic={effectiveChildFilterId === null ? false : "selection"}
          onPress={() => setChildFilterId(null)}
          accessibilityRole="button"
          accessibilityLabel={`Show all ${children.length} children`}
          accessibilityState={{ selected: effectiveChildFilterId === null }}
          style={({ pressed }) => [
            styles.childFilterChip,
            effectiveChildFilterId === null && styles.childFilterChipActive,
            pressed && styles.rowPressed,
          ]}
        >
          <SymbolView
            name="person.2.fill"
            size={14}
            tintColor={
              effectiveChildFilterId === null
                ? colors.surface
                : colors.titleTeal
            }
          />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
            style={[
              styles.childFilterText,
              effectiveChildFilterId === null &&
                styles.childFilterTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {children.map((child) => {
          const selected = effectiveChildFilterId === child.id;
          const current = activeChildId === child.id;
          const group = allChildGroups.find(
            (item) => item.child.id === child.id,
          );
          return (
            <Pressable
              key={child.id}
              testID={`child-filter-${child.id}`}
              haptic={selected ? false : "selection"}
              onPress={() => selectChild(child.id)}
              accessibilityRole="button"
              accessibilityLabel={`${child.name}, ${childContentSummary(group?.counts ?? { sketchpads: 0, artworks: 0 })}${current ? ", current child" : ""}`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.childFilterChip,
                selected && styles.childFilterChipSelected,
                pressed && styles.rowPressed,
              ]}
            >
              <View
                style={[
                  styles.childFilterAvatar,
                  { backgroundColor: child.avatarColor },
                ]}
              >
                <Text style={styles.childFilterAvatarText}>
                  {child.name.trim().charAt(0).toUpperCase() || "C"}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
                style={styles.childFilterText}
              >
                {child.name}
              </Text>
              {current ? (
                <SymbolView
                  name="checkmark.circle.fill"
                  size={14}
                  tintColor={colors.titleTeal}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Text maxFontSizeMultiplier={DRAWER_TEXT_SCALE} style={styles.listLabel}>
        Children & sketchpads
      </Text>

      <ScrollView
        style={styles.sketchpadScroll}
        contentContainerStyle={styles.sketchpadScrollContent}
        scrollIndicatorInsets={{ right: 2 }}
        keyboardShouldPersistTaps="handled"
      >
        {childGroups.map((group) => {
          const current = group.child.id === activeChildId;
          return (
            <View key={group.child.id} style={styles.childGroup}>
              <Pressable
                testID={`child-group-${group.child.id}`}
                haptic={current ? false : "selection"}
                onPress={() => selectChild(group.child.id)}
                accessibilityRole="button"
                accessibilityLabel={`${group.child.name}, ${childContentSummary(group.counts)}${current ? ", current child" : ""}`}
                accessibilityHint="Selects this child and filters the drawer to their sketchpads."
                accessibilityState={{ selected: current }}
                style={({ pressed }) => [
                  styles.childGroupHeader,
                  current && styles.childGroupHeaderCurrent,
                  pressed && styles.rowPressed,
                ]}
              >
                <View
                  style={[
                    styles.childGroupAvatar,
                    { backgroundColor: group.child.avatarColor },
                  ]}
                >
                  <Text style={styles.childGroupAvatarText}>
                    {group.child.name.trim().charAt(0).toUpperCase() || "C"}
                  </Text>
                </View>
                <View style={styles.childGroupCopy}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
                    style={styles.childGroupName}
                  >
                    {group.child.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
                    style={styles.childGroupMeta}
                  >
                    {childContentSummary(group.counts)}
                  </Text>
                </View>
                {current ? (
                  <View style={styles.currentChildBadge}>
                    <Text style={styles.currentChildBadgeText}>CURRENT</Text>
                  </View>
                ) : (
                  <SymbolView
                    name="chevron.right"
                    size={12}
                    tintColor={colors.mutedText}
                  />
                )}
              </Pressable>
              <View style={styles.childPadList}>
                {group.pads.map(renderPadRow)}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={DRAWER_TEXT_SCALE}
        style={styles.hint}
      >
        Use the pencil to customize · long-press to delete
      </Text>
    </View>
  );
}

export function VisualOptionGrid<T extends string>({
  kind,
  options,
  selected,
  onSelect,
}: {
  kind: "border" | "decoration";
  options: readonly PadVisualOption<T>[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={styles.visualOptionGrid}>
      {options.map((option) => {
        const active = selected === option.id;
        return (
          <Pressable
            key={option.id}
            haptic={active ? false : "selection"}
            onPress={() => onSelect(option.id)}
            accessibilityRole="radio"
            accessibilityLabel={`${option.name}. ${option.tagline}${option.premium ? ". Pro" : ""}`}
            accessibilityHint={
              option.premium
                ? "Previews a premium look. Pro is required to save it."
                : undefined
            }
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.visualOption,
              active && styles.visualOptionActive,
              pressed && styles.rowPressed,
            ]}
          >
            <View
              style={[
                styles.visualSwatch,
                { backgroundColor: option.previewColor },
              ]}
            >
              {kind === "decoration" ? (
                <MiniDecorationPreview
                  id={option.id as PadDecorationId}
                  stamp="paw"
                  accent={option.id === "none" ? colors.ink : colors.surface}
                  secondary="rgba(255,255,255,0.68)"
                />
              ) : option.id !== "none" ? (
                <View
                  style={[
                    styles.visualSwatchInner,
                    { borderColor: colors.surface },
                  ]}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.visualOptionName} numberOfLines={1}>
                {option.name}
              </Text>
              <Text style={styles.visualOptionTagline} numberOfLines={1}>
                {option.tagline}
              </Text>
            </View>
            {option.premium ? (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            ) : null}
            <View style={styles.visualSelectionSlot}>
              {active ? (
                <SymbolView
                  name="checkmark.circle.fill"
                  size={17}
                  tintColor={colors.titleTeal}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DesignGrid({
  style,
  selected,
  onSelect,
}: {
  style: PadStyle;
  selected: PadDesignId;
  onSelect: (design: PadDesignId) => void;
}) {
  const rows = Array.from(
    { length: Math.ceil(PAD_DESIGNS.length / 2) },
    (_, index) => PAD_DESIGNS.slice(index * 2, index * 2 + 2),
  );

  return (
    <View style={styles.designGrid}>
      {rows.map((row) => (
        <View key={row[0].id} style={styles.designGridRow}>
          {row.map((design) => {
            const active = selected === design.id;
            return (
              <Pressable
                key={design.id}
                haptic={active ? false : "selection"}
                onPress={() => onSelect(design.id)}
                accessibilityRole="button"
                accessibilityLabel={`${design.name}. ${design.tagline}${design.premium ? ". Pro" : ""}`}
                accessibilityHint={
                  design.premium
                    ? "Previews this premium theme. Pro is required to save it."
                    : "Selects this sketchpad theme"
                }
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.designCard,
                  active && styles.designCardActive,
                  pressed && styles.rowPressed,
                ]}
              >
                <MiniCover style={style} design={design.id} large />
                <Text style={styles.designName} numberOfLines={2}>
                  {design.name}
                </Text>
                <Text style={styles.designTagline} numberOfLines={2}>
                  {design.tagline}
                </Text>
                {design.premium ? (
                  <View style={styles.designProBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                ) : null}
                {active ? (
                  <View style={styles.designCheck}>
                    <SymbolView
                      name="checkmark"
                      size={11}
                      tintColor={colors.surface}
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {row.length === 1 ? <View style={styles.designCardSpacer} /> : null}
        </View>
      ))}
    </View>
  );
}

export function MiniCover({
  style,
  design,
  color,
  pageColor,
  border = "none",
  decoration = "none",
  large = false,
  scale,
}: {
  style: PadStyle;
  design?: PadDesignId;
  color?: string;
  pageColor?: string;
  border?: PadBorderId;
  decoration?: PadDecorationId;
  large?: boolean;
  scale?: number;
}) {
  const palette = getPadDesign(design, color);
  const wide = style === "spread" || style === "album";
  const sizeScale = scale ?? (large ? 1.35 : 1);
  const w = (wide ? 42 : 30) * sizeScale;
  const h = (wide ? 30 : 40) * sizeScale;
  const ringStyle =
    style === "album" ? styles.coverRingsLeft : styles.coverRings;
  return (
    <View style={[styles.coverWrap, { width: w + 8, height: h + 4 }]}>
      <View
        style={[
          styles.coverTabLeft,
          { backgroundColor: palette.tabs[0].color },
        ]}
      />
      <View
        style={[
          styles.coverTabRight,
          { backgroundColor: palette.tabs[1].color },
        ]}
      />
      <View
        style={[
          styles.cover,
          { width: w, height: h, backgroundColor: color ?? palette.cover },
        ]}
      >
        <View
          style={[
            styles.coverPage,
            { backgroundColor: pageColor ?? palette.paper },
            style === "album" && { flexDirection: "row" },
          ]}
        >
          {style === "spread" ? (
            <View
              style={[styles.coverSpine, { backgroundColor: palette.ring }]}
            />
          ) : null}
          {style === "vertical" ? (
            <View style={[ringStyle, { backgroundColor: palette.ring }]} />
          ) : null}
          {style === "album" ? (
            <View style={[ringStyle, { backgroundColor: palette.ring }]} />
          ) : null}
          {style === "grid" ? (
            <View style={styles.coverGrid}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.coverGridDot,
                    { backgroundColor: palette.slotBorder },
                  ]}
                />
              ))}
            </View>
          ) : null}
          {style === "strip" ? (
            <View style={styles.coverStrip}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.coverStripLine,
                    { backgroundColor: palette.slotBorder },
                  ]}
                />
              ))}
            </View>
          ) : null}
          {border !== "none" ? (
            <View
              pointerEvents="none"
              style={[
                styles.miniBorder,
                {
                  borderColor:
                    border === "museum-frame" ? "#C89B4B" : palette.stampColor,
                  borderWidth:
                    border === "gallery-mat" || border === "museum-frame"
                      ? 2
                      : 1,
                  borderStyle:
                    border === "torn-paper" || border === "crayon-edge"
                      ? "dashed"
                      : "solid",
                },
              ]}
            />
          ) : null}
          <MiniDecorationPreview
            id={decoration}
            stamp={palette.stamp}
            accent={palette.stampColor}
            secondary={palette.tabs[1].color}
          />
        </View>
      </View>
    </View>
  );
}

function MiniDecorationPreview({
  id,
  stamp = "paw",
  accent,
  secondary,
}: {
  id: PadDecorationId;
  stamp?: PadStamp;
  accent: string;
  secondary: string;
}) {
  if (id === "none") {
    if (stamp === "paw") {
      return (
        <View pointerEvents="none" style={styles.miniDecorationLayer}>
          <View style={[styles.miniPawPad, { backgroundColor: accent }]} />
          <View style={[styles.miniPawToeOne, { backgroundColor: accent }]} />
          <View style={[styles.miniPawToeTwo, { backgroundColor: accent }]} />
          <View style={[styles.miniPawToeThree, { backgroundColor: accent }]} />
          <View style={[styles.miniPawToeFour, { backgroundColor: accent }]} />
        </View>
      );
    }
    const glyph = stamp === "flower" ? "✿" : stamp === "heart" ? "♥" : "✦";
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text style={[styles.miniThemeMark, { color: accent }]}>{glyph}</Text>
      </View>
    );
  }
  if (id === "confetti-pop") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <View
          style={[
            styles.miniDot,
            styles.miniDotTopLeft,
            { backgroundColor: accent },
          ]}
        />
        <View
          style={[
            styles.miniDot,
            styles.miniDotTopRight,
            { backgroundColor: secondary },
          ]}
        />
        <View
          style={[
            styles.miniDotSmall,
            styles.miniDotBottomLeft,
            { backgroundColor: secondary },
          ]}
        />
        <View
          style={[
            styles.miniDotSmall,
            styles.miniDotBottomRight,
            { backgroundColor: accent },
          ]}
        />
      </View>
    );
  }
  if (id === "sparkle-trail") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text
          style={[styles.miniMark, styles.miniMarkTopRight, { color: accent }]}
        >
          ✦
        </Text>
        <Text
          style={[
            styles.miniMarkSmall,
            styles.miniMarkBottomLeft,
            { color: secondary },
          ]}
        >
          ✧
        </Text>
      </View>
    );
  }
  if (id === "heart-parade") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text
          style={[
            styles.miniMark,
            styles.miniMarkTopRight,
            { color: secondary },
          ]}
        >
          ♥
        </Text>
        <Text
          style={[
            styles.miniMarkSmall,
            styles.miniMarkBottomLeft,
            { color: accent },
          ]}
        >
          ♥
        </Text>
      </View>
    );
  }
  if (id === "flower-garden") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text
          style={[
            styles.miniMark,
            styles.miniMarkTopRight,
            { color: secondary },
          ]}
        >
          ✿
        </Text>
        <Text
          style={[
            styles.miniMarkSmall,
            styles.miniMarkBottomLeft,
            { color: accent },
          ]}
        >
          ✿
        </Text>
      </View>
    );
  }
  if (id === "starry-sky") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text
          style={[styles.miniMark, styles.miniMarkTopRight, { color: accent }]}
        >
          ★
        </Text>
        <View style={[styles.miniPlanet, { backgroundColor: secondary }]} />
        <Text
          style={[
            styles.miniMarkSmall,
            styles.miniMarkBottomLeft,
            { color: secondary },
          ]}
        >
          ✦
        </Text>
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={styles.miniDecorationLayer}>
      <Text
        style={[
          styles.miniMarkSmall,
          styles.miniMarkTopLeft,
          { color: accent },
        ]}
      >
        ♥
      </Text>
      <Text
        style={[styles.miniMark, styles.miniMarkTopRight, { color: secondary }]}
      >
        ✦
      </Text>
      <Text
        style={[
          styles.miniMarkSmall,
          styles.miniMarkBottomLeft,
          { color: secondary },
        ]}
      >
        ✿
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 16,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 58,
    marginBottom: 14,
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headingEyebrow: {
    marginLeft: 2,
    marginBottom: -3,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.15,
    color: colors.titleCoral,
  },
  brand: {
    flexShrink: 0,
    marginVertical: -3,
  },
  closeButton: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 20,
  },
  glassIconTouchable: {
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 2,
    borderRadius: SKETCHPAD_ROW_RADIUS,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 58,
    marginBottom: 2,
    overflow: "hidden",
  },
  rowMain: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  editButton: {
    flexShrink: 0,
    marginRight: 2,
  },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 54,
    borderRadius: 16,
  },
  newRowTop: {
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  quickAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 74,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionAvatar: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.titleCoral,
  },
  quickActionTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.ink,
  },
  childFilterHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  childFilterLabel: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  childFilterHint: {
    fontSize: 11,
    color: colors.mutedText,
  },
  childFilterScroll: {
    flexGrow: 0,
    marginBottom: 11,
  },
  childFilterContent: {
    gap: 6,
    paddingRight: 8,
  },
  childFilterChip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  childFilterChipActive: {
    borderColor: colors.titleTeal,
    backgroundColor: colors.titleTeal,
  },
  childFilterChipSelected: {
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(22,125,130,0.09)",
  },
  childFilterAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  childFilterAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: colors.ink,
  },
  childFilterText: {
    maxWidth: 112,
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
  },
  childFilterTextActive: {
    color: colors.surface,
  },
  listLabel: {
    paddingHorizontal: 4,
    paddingBottom: 7,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.mutedText,
  },
  childGroup: {
    marginBottom: 8,
  },
  childGroupHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 15,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 3,
  },
  childGroupHeaderCurrent: {
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(22,125,130,0.08)",
  },
  childGroupAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  childGroupAvatarText: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.ink,
  },
  childGroupCopy: {
    flex: 1,
    minWidth: 0,
  },
  childGroupName: {
    fontSize: 14.5,
    fontWeight: "900",
    color: colors.ink,
  },
  childGroupMeta: {
    marginTop: 1,
    fontSize: 11,
    color: colors.mutedText,
  },
  currentChildBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(22,125,130,0.12)",
  },
  currentChildBadgeText: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: colors.titleTeal,
  },
  childPadList: {
    paddingLeft: 3,
  },
  rowActive: {
    borderWidth: 1.5,
    boxShadow: "0 2px 8px rgba(40,67,90,0.10)",
  },
  coverStatusWrap: {
    position: "relative",
    flexShrink: 0,
    width: 44,
    height: 44,
  },
  coverTile: {
    width: 44,
    height: 44,
    borderRadius: SKETCHPAD_ICON_RADIUS,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  currentMarker: {
    position: "absolute",
    right: -3,
    top: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 4px rgba(40,67,90,0.18)",
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  sketchpadScroll: {
    flex: 1,
    marginRight: -8,
  },
  sketchpadScrollContent: {
    paddingRight: 10,
    paddingBottom: 12,
  },
  rowMeta: {
    fontSize: 11.5,
    lineHeight: 14,
    color: colors.mutedText,
    marginTop: 1,
  },
  coverWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  coverTabLeft: {
    position: "absolute",
    left: 0,
    top: "44%",
    width: 8,
    height: 15,
    borderRadius: 5,
  },
  coverTabRight: {
    position: "absolute",
    right: 0,
    top: "24%",
    width: 8,
    height: 15,
    borderRadius: 5,
  },
  cover: {
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(40,67,90,0.13)",
  },
  coverPage: {
    width: "72%",
    height: "70%",
    backgroundColor: colors.page,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverSpine: {
    width: 2,
    height: "78%",
    backgroundColor: colors.ringCoral,
    borderRadius: 1,
  },
  coverRings: {
    width: "70%",
    height: 2,
    backgroundColor: colors.ringCoral,
    alignSelf: "center",
    marginTop: -10,
    borderRadius: 1,
  },
  coverRingsLeft: {
    width: 2,
    height: "70%",
    backgroundColor: colors.ringCoral,
    marginLeft: 2,
    borderRadius: 1,
  },
  coverGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 14,
    gap: 2,
    alignSelf: "center",
  },
  coverGridDot: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
    backgroundColor: colors.slotBorder,
  },
  newIcon: {
    width: 42,
    height: 30,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.titleCoral,
    alignItems: "center",
    justifyContent: "center",
  },
  designGrid: {
    gap: 10,
  },
  designGridRow: {
    flexDirection: "row",
    gap: 10,
  },
  designCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  designCardSpacer: {
    flex: 1,
  },
  designCardActive: {
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(72,198,183,0.08)",
  },
  designName: {
    minHeight: 30,
    fontSize: 12.5,
    lineHeight: 15,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    marginTop: 8,
  },
  designTagline: {
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.mutedText,
    textAlign: "center",
    marginTop: 2,
  },
  designCheck: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.titleTeal,
    alignItems: "center",
    justifyContent: "center",
  },
  designProBadge: {
    position: "absolute",
    left: 7,
    top: 7,
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  visualOptionGrid: {
    gap: 7,
  },
  visualOption: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  visualOptionActive: {
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(72,198,183,0.08)",
  },
  visualSelectionSlot: {
    width: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  visualSwatch: {
    width: 39,
    height: 39,
    borderRadius: 11,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  visualSwatchInner: {
    width: 25,
    height: 25,
    borderRadius: 7,
    borderCurve: "continuous",
    borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  visualOptionName: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
  },
  visualOptionTagline: {
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.mutedText,
  },
  proBadge: {
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  proBadgeText: {
    color: colors.surface,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  coverStrip: {
    width: "72%",
    gap: 2,
    alignSelf: "center",
  },
  coverStripLine: {
    height: 4,
    borderRadius: 1.5,
    backgroundColor: colors.slotBorder,
  },
  miniBorder: {
    position: "absolute",
    left: 2,
    right: 2,
    top: 2,
    bottom: 2,
    borderRadius: 4,
  },
  miniDecorationLayer: {
    position: "absolute",
    inset: 0,
  },
  miniDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  miniDotSmall: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  miniDotTopLeft: { left: 3, top: 3 },
  miniDotTopRight: { right: 3, top: 4 },
  miniDotBottomLeft: { left: 5, bottom: 3 },
  miniDotBottomRight: { right: 4, bottom: 3 },
  miniMark: {
    position: "absolute",
    fontSize: 8,
    lineHeight: 9,
    fontWeight: "900",
  },
  miniMarkSmall: {
    position: "absolute",
    fontSize: 6,
    lineHeight: 7,
    fontWeight: "900",
  },
  miniMarkTopLeft: { left: 2, top: 1 },
  miniMarkTopRight: { right: 2, top: 1 },
  miniMarkBottomLeft: { left: 2, bottom: 1 },
  miniThemeMark: {
    position: "absolute",
    left: 2,
    bottom: 0,
    fontSize: 8,
    lineHeight: 9,
    fontWeight: "900",
  },
  miniPawPad: {
    position: "absolute",
    left: 3,
    bottom: 2,
    width: 7,
    height: 5,
    borderRadius: 4,
    transform: [{ rotate: "-14deg" }],
  },
  miniPawToeOne: {
    position: "absolute",
    left: 2,
    bottom: 8,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  miniPawToeTwo: {
    position: "absolute",
    left: 6,
    bottom: 10,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  miniPawToeThree: {
    position: "absolute",
    left: 10,
    bottom: 9,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  miniPawToeFour: {
    position: "absolute",
    left: 13,
    bottom: 6,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  miniPlanet: {
    position: "absolute",
    right: 9,
    top: 8,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  hint: {
    fontSize: 12,
    color: colors.mutedText,
    textAlign: "center",
    paddingVertical: 12,
  },
});
