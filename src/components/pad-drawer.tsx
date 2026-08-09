import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Host, Picker } from "@expo/ui";
import { useFonts } from "expo-font";

import { useDrawings, type PadStyle, type Sketchpad } from "@/store/drawings";
import { useProfiles } from "@/store/profiles";
import {
  getPadDesign,
  PAD_DESIGNS,
  type PadDesignId,
  type PadStamp,
} from "@/pad-designs";
import {
  PAD_BORDERS,
  PAD_DECORATIONS,
  type PadBorderId,
  type PadDecorationId,
  type PadVisualOption,
} from "@/pad-visuals";
import { confirmAdult } from "@/store/parental-gate";
import { colors, PAGE_COLORS, PATRICK_HAND } from "@/theme";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PANEL_MAX_W = 352;
const PANEL_SCREEN_GUTTER = 16;

const STYLE_LABEL: Record<PadStyle, string> = {
  spread: "Spread book",
  vertical: "Vertical pad",
  album: "Album",
  grid: "Photo grid",
  strip: "Filmstrip",
};

export function PadDrawer({ open, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const panelWidth = Math.min(PANEL_MAX_W, Math.max(0, windowWidth - PANEL_SCREEN_GUTTER));
  const allPads = useDrawings((s) => s.pads);
  const activeChildId = useProfiles((s) => s.activeChildId);
  const pads = allPads.filter((pad) => pad.childId === activeChildId);
  const activePadId = useDrawings((s) => s.activePadId);
  const drawingsByPad = useDrawings((s) => s.drawingsByPad);
  const setActivePad = useDrawings((s) => s.setActivePad);
  const createPad = useDrawings((s) => s.createPad);
  const setPadVisuals = useDrawings((s) => s.setPadVisuals);
  const renamePad = useDrawings((s) => s.renamePad);
  const deletePad = useDrawings((s) => s.deletePad);

  const [brandFontLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStyle, setNewStyle] = useState<PadStyle>("spread");
  const [newDesign, setNewDesign] = useState<PadDesignId>("sunshine");
  const [newPageColor, setNewPageColor] = useState<string>(getPadDesign("sunshine").paper);
  const [newBorder, setNewBorder] = useState<PadBorderId>("none");
  const [newDecoration, setNewDecoration] = useState<PadDecorationId>("none");
  const [designingPadId, setDesigningPadId] = useState<string | null>(null);

  const anim = useSharedValue(0);
  useEffect(() => {
    anim.value = withTiming(open ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
    if (!open) {
      setCreating(false);
      setDesigningPadId(null);
    }
  }, [open, anim]);

  const panelStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: interpolate(anim.value, [0, 1], [-panelWidth - 20, 0]) }],
    }),
    [panelWidth],
  );
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
  }));

  const submitCreate = () => {
    const createdPadId = createPad(
      newName,
      newStyle,
      newDesign,
      newPageColor,
      activeChildId ?? undefined,
      newBorder,
      newDecoration,
    );
    if (!createdPadId) return;
    setNewName("");
    setNewBorder("none");
    setNewDecoration("none");
    setCreating(false);
    onClose();
  };

  const designingPad = pads.find((pad) => pad.id === designingPadId);

  const managePad = (pad: Sketchpad) => {
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
          if (pads.length <= 1) {
            Alert.alert("Can't delete", "This is your only sketchpad.");
            return;
          }
          const count = (drawingsByPad[pad.id] ?? []).length;
          void (async () => {
            if (!(await confirmAdult("Deleting a sketchpad permanently removes its local artwork."))) return;
            Alert.alert(
              `Delete “${pad.name}”?`,
              count > 0 ? `Its ${count} drawing${count === 1 ? "" : "s"} will be deleted too.` : undefined,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => deletePad(pad.id) },
              ],
            );
          })();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sketchpads"
        />
      </Animated.View>

      <Animated.View
        style={[styles.panel, { width: panelWidth, paddingTop: insets.top + 18 }, panelStyle]}
      >
        <View style={styles.headingRow}>
          <Text style={[styles.brand, brandFontLoaded && styles.brandFont]}>
            <Text style={{ color: colors.titleCoral }}>B</Text>
            <Text style={{ color: colors.titleTeal }}>u</Text>
            <Text style={{ color: colors.titleYellow }}>k</Text>
            <Text style={{ color: colors.titleBlue }}>i</Text>
          </Text>
          <Text style={styles.headingCaption}>{designingPad ? "Customize sketchpad" : "Sketchpads"}</Text>
          {designingPad ? (
            <Pressable
              onPress={() => setDesigningPadId(null)}
              accessibilityRole="button"
              accessibilityLabel="Back to sketchpads"
              style={({ pressed }) => [styles.headingAction, pressed && styles.rowPressed]}
            >
              <SymbolView name="xmark" size={15} tintColor={colors.ink} />
            </Pressable>
          ) : null}
        </View>

        {designingPad ? (
          <DesignChooser
            pad={designingPad}
            onSave={(visuals) => {
              const saved = setPadVisuals(designingPad.id, visuals);
              if (saved) setDesigningPadId(null);
              return saved;
            }}
          />
        ) : (
          <>
            <Pressable
              onPress={() => setCreating((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={creating ? "Cancel new sketchpad" : "Create a new sketchpad"}
              style={({ pressed }) => [
                styles.newRow,
                styles.newRowTop,
                creating && styles.newRowActive,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={[styles.newIcon, creating && styles.newIconActive]}>
                <SymbolView
                  name={creating ? "xmark" : "plus"}
                  size={18}
                  tintColor={colors.titleCoral}
                />
              </View>
              <Text style={[styles.rowName, { color: colors.titleCoral }]}>New sketchpad</Text>
            </Pressable>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              {creating ? (
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                  <View style={styles.createBox}>
                    <TextInput
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="Sketchpad name"
                      placeholderTextColor="#B9AF9E"
                      style={styles.input}
                      accessibilityLabel="Sketchpad name"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={submitCreate}
                    />
                    <View style={styles.styleRow}>
                      <View style={styles.stylePreview}>
                        <MiniCover
                          style={newStyle}
                          design={newDesign}
                          pageColor={newPageColor}
                          border={newBorder}
                          decoration={newDecoration}
                          large
                        />
                        <Text style={styles.styleLabel}>{STYLE_LABEL[newStyle]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Host matchContents>
                          <Picker
                            selectedValue={newStyle}
                            onValueChange={(v) => setNewStyle(v as PadStyle)}
                          >
                            <Picker.Item label="Spread book" value="spread" />
                            <Picker.Item label="Vertical pad" value="vertical" />
                            <Picker.Item label="Album" value="album" />
                            <Picker.Item label="Photo grid" value="grid" />
                            <Picker.Item label="Filmstrip" value="strip" />
                          </Picker>
                        </Host>
                      </View>
                    </View>
                    <Text style={styles.sectionLabel}>Sketchpad design</Text>
                    <DesignGrid
                      style={newStyle}
                      selected={newDesign}
                      onSelect={(design) => {
                        setNewDesign(design);
                        setNewPageColor(getPadDesign(design).paper);
                      }}
                    />
                    <Text style={styles.sectionLabel}>Border</Text>
                    <VisualOptionGrid
                      kind="border"
                      options={PAD_BORDERS}
                      selected={newBorder}
                      onSelect={(border) => setNewBorder(border)}
                    />
                    <Text style={styles.sectionLabel}>Decorations</Text>
                    <VisualOptionGrid
                      kind="decoration"
                      options={PAD_DECORATIONS}
                      selected={newDecoration}
                      onSelect={(decoration) => setNewDecoration(decoration)}
                    />
                    <Text style={styles.sectionLabel}>Paper</Text>
                    <View style={styles.colorRow}>
                      {PAGE_COLORS.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setNewPageColor(c)}
                          accessibilityRole="radio"
                          accessibilityLabel={`Page color ${c}`}
                          accessibilityState={{ selected: newPageColor === c }}
                          style={[
                            styles.pageDot,
                            { backgroundColor: c },
                            newPageColor === c && styles.pageDotActive,
                          ]}
                        />
                      ))}
                    </View>
                    <Pressable
                      onPress={submitCreate}
                      accessibilityRole="button"
                      accessibilityLabel="Create sketchpad"
                      style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
                    >
                      <Text style={styles.createBtnText}>Create</Text>
                    </Pressable>
                  </View>
                </KeyboardAvoidingView>
              ) : null}

              {pads.map((pad) => {
                const count = (drawingsByPad[pad.id] ?? []).length;
                const active = pad.id === activePadId;
                const design = getPadDesign(pad.design, pad.coverColor);
                return (
                  <View
                    key={pad.id}
                    style={[
                      styles.row,
                      active && styles.rowActive,
                      active && { backgroundColor: design.paper, borderColor: design.cover },
                    ]}
                  >
                    {active ? (
                      <View style={[styles.activeStripe, { backgroundColor: design.cover }]} />
                    ) : null}
                    <Pressable
                      onPress={() => {
                        setActivePad(pad.id);
                        onClose();
                      }}
                      onLongPress={() => managePad(pad)}
                      accessibilityRole="button"
                      accessibilityLabel={`${pad.name}, ${design.name}, ${STYLE_LABEL[pad.style]}, ${count} ${count === 1 ? "drawing" : "drawings"}`}
                      accessibilityHint="Selects this sketchpad. Long-press to rename or delete it."
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
                    >
                      <MiniCover
                        style={pad.style}
                        design={pad.design}
                        color={pad.coverColor}
                        pageColor={pad.pageColor}
                        border={pad.border}
                        decoration={pad.decoration}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {pad.name}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {design.name} · {count} {count === 1 ? "drawing" : "drawings"}
                        </Text>
                      </View>
                      {active ? (
                        <View style={[styles.currentBadge, { backgroundColor: design.cover }]}>
                          <SymbolView name="sparkles" size={10} tintColor="#FFFDF4" />
                          <Text style={styles.currentBadgeText}>Current</Text>
                        </View>
                      ) : null}
                    </Pressable>
                    <Pressable
                      onPress={() => setDesigningPadId(pad.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Change design for ${pad.name}`}
                      style={({ pressed }) => [styles.designButton, pressed && styles.rowPressed]}
                    >
                      <SymbolView name="paintpalette.fill" size={17} tintColor={design.cover} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <Text style={styles.hint}>Tap the palette to change a design · long-press to manage</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

function DesignChooser({
  pad,
  onSave,
}: {
  pad: Sketchpad;
  onSave: (visuals: {
    style: PadStyle;
    design: PadDesignId;
    border: PadBorderId;
    decoration: PadDecorationId;
    pageColor: string;
  }) => boolean;
}) {
  const [style, setStyle] = useState(pad.style);
  const [design, setDesign] = useState(pad.design);
  const [border, setBorder] = useState(pad.border);
  const [decoration, setDecoration] = useState(pad.decoration);
  const [pageColor, setPageColor] = useState(pad.pageColor ?? getPadDesign(pad.design).paper);

  useEffect(() => {
    setStyle(pad.style);
    setDesign(pad.design);
    setBorder(pad.border);
    setDecoration(pad.decoration);
    setPageColor(pad.pageColor ?? getPadDesign(pad.design).paper);
  }, [pad]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.designChooserContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.designPreviewCard}>
        <MiniCover
          style={style}
          design={design}
          pageColor={pageColor}
          border={border}
          decoration={decoration}
          large
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.designPreviewTitle}>Preview your sketchpad</Text>
          <Text style={styles.designPreviewText}>
            Free members can try every look here. Pro is required only when saving a premium choice.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Layout</Text>
      <View style={styles.layoutChoiceRow}>
        <Text style={styles.layoutChoiceLabel}>{STYLE_LABEL[style]}</Text>
        <View style={styles.layoutPicker}>
          <Host matchContents>
            <Picker selectedValue={style} onValueChange={(value) => setStyle(value as PadStyle)}>
              <Picker.Item label="Spread book" value="spread" />
              <Picker.Item label="Vertical pad" value="vertical" />
              <Picker.Item label="Album" value="album" />
              <Picker.Item label="Photo grid" value="grid" />
              <Picker.Item label="Filmstrip" value="strip" />
            </Picker>
          </Host>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Theme</Text>
      <DesignGrid
        style={style}
        selected={design}
        onSelect={(nextDesign) => {
          setDesign(nextDesign);
          setPageColor(getPadDesign(nextDesign).paper);
        }}
      />

      <Text style={styles.sectionLabel}>Border</Text>
      <VisualOptionGrid kind="border" options={PAD_BORDERS} selected={border} onSelect={setBorder} />

      <Text style={styles.sectionLabel}>Decorations</Text>
      <VisualOptionGrid
        kind="decoration"
        options={PAD_DECORATIONS}
        selected={decoration}
        onSelect={setDecoration}
      />

      <Text style={styles.sectionLabel}>Paper</Text>
      <View style={styles.colorRow}>
        {PAGE_COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => setPageColor(color)}
            accessibilityRole="radio"
            accessibilityLabel={`Page color ${color}`}
            accessibilityState={{ selected: pageColor === color }}
            style={[
              styles.pageDot,
              { backgroundColor: color },
              pageColor === color && styles.pageDotActive,
            ]}
          />
        ))}
      </View>

      <Pressable
        onPress={() => onSave({ style, design, border, decoration, pageColor })}
        accessibilityRole="button"
        accessibilityLabel="Save sketchpad look"
        style={({ pressed }) => [styles.createBtn, styles.saveLookButton, pressed && styles.createBtnPressed]}
      >
        <Text style={styles.createBtnText}>Save look</Text>
      </Pressable>
    </ScrollView>
  );
}

function VisualOptionGrid<T extends string>({
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
            onPress={() => onSelect(option.id)}
            accessibilityRole="radio"
            accessibilityLabel={`${option.name}. ${option.tagline}${option.premium ? ". Pro" : ""}`}
            accessibilityHint={option.premium ? "Previews a premium look. Pro is required to save it." : undefined}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.visualOption,
              active && styles.visualOptionActive,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={[styles.visualSwatch, { backgroundColor: option.previewColor }]}>
              {kind === "decoration" ? (
                <MiniDecorationPreview
                  id={option.id as PadDecorationId}
                  stamp="paw"
                  accent={option.id === "none" ? colors.ink : colors.surface}
                  secondary="rgba(255,255,255,0.68)"
                />
              ) : option.id !== "none" ? (
                <View style={[styles.visualSwatchInner, { borderColor: colors.surface }]} />
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
            {active ? (
              <SymbolView name="checkmark.circle.fill" size={17} tintColor={colors.titleTeal} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function DesignGrid({
  style,
  selected,
  onSelect,
}: {
  style: PadStyle;
  selected: PadDesignId;
  onSelect: (design: PadDesignId) => void;
}) {
  const rows = Array.from({ length: Math.ceil(PAD_DESIGNS.length / 2) }, (_, index) =>
    PAD_DESIGNS.slice(index * 2, index * 2 + 2),
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
                onPress={() => onSelect(design.id)}
                accessibilityRole="button"
                accessibilityLabel={`${design.name}. ${design.tagline}${design.premium ? ". Pro" : ""}`}
                accessibilityHint={design.premium ? "Previews this premium theme. Pro is required to save it." : "Selects this sketchpad theme"}
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
                    <SymbolView name="checkmark" size={11} tintColor={colors.surface} />
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

function MiniCover({
  style,
  design,
  color,
  pageColor,
  border = "none",
  decoration = "none",
  large = false,
}: {
  style: PadStyle;
  design?: PadDesignId;
  color?: string;
  pageColor?: string;
  border?: PadBorderId;
  decoration?: PadDecorationId;
  large?: boolean;
}) {
  const palette = getPadDesign(design, color);
  const wide = style === "spread" || style === "album";
  const w = (wide ? 42 : 30) * (large ? 1.35 : 1);
  const h = (wide ? 30 : 40) * (large ? 1.35 : 1);
  const ringStyle = style === "album" ? styles.coverRingsLeft : styles.coverRings;
  return (
    <View
      style={[styles.coverWrap, { width: w + 8, height: h + 4 }]}
    >
      <View style={[styles.coverTabLeft, { backgroundColor: palette.tabs[0].color }]} />
      <View style={[styles.coverTabRight, { backgroundColor: palette.tabs[1].color }]} />
      <View
        style={[styles.cover, { width: w, height: h, backgroundColor: color ?? palette.cover }]}
      >
        <View
          style={[
            styles.coverPage,
            { backgroundColor: pageColor ?? palette.paper },
            style === "album" && { flexDirection: "row" },
          ]}
        >
          {style === "spread" ? <View style={[styles.coverSpine, { backgroundColor: palette.ring }]} /> : null}
          {style === "vertical" ? <View style={[ringStyle, { backgroundColor: palette.ring }]} /> : null}
          {style === "album" ? <View style={[ringStyle, { backgroundColor: palette.ring }]} /> : null}
          {style === "grid" ? (
            <View style={styles.coverGrid}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.coverGridDot, { backgroundColor: palette.slotBorder }]} />
              ))}
            </View>
          ) : null}
          {style === "strip" ? (
            <View style={styles.coverStrip}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.coverStripLine, { backgroundColor: palette.slotBorder }]} />
              ))}
            </View>
          ) : null}
          {border !== "none" ? (
            <View
              pointerEvents="none"
              style={[
                styles.miniBorder,
                {
                  borderColor: border === "museum-frame" ? "#C89B4B" : palette.stampColor,
                  borderWidth: border === "gallery-mat" || border === "museum-frame" ? 2 : 1,
                  borderStyle: border === "torn-paper" || border === "crayon-edge" ? "dashed" : "solid",
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
        <View style={[styles.miniDot, styles.miniDotTopLeft, { backgroundColor: accent }]} />
        <View style={[styles.miniDot, styles.miniDotTopRight, { backgroundColor: secondary }]} />
        <View style={[styles.miniDotSmall, styles.miniDotBottomLeft, { backgroundColor: secondary }]} />
        <View style={[styles.miniDotSmall, styles.miniDotBottomRight, { backgroundColor: accent }]} />
      </View>
    );
  }
  if (id === "sparkle-trail") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text style={[styles.miniMark, styles.miniMarkTopRight, { color: accent }]}>✦</Text>
        <Text style={[styles.miniMarkSmall, styles.miniMarkBottomLeft, { color: secondary }]}>✧</Text>
      </View>
    );
  }
  if (id === "heart-parade") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text style={[styles.miniMark, styles.miniMarkTopRight, { color: secondary }]}>♥</Text>
        <Text style={[styles.miniMarkSmall, styles.miniMarkBottomLeft, { color: accent }]}>♥</Text>
      </View>
    );
  }
  if (id === "flower-garden") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text style={[styles.miniMark, styles.miniMarkTopRight, { color: secondary }]}>✿</Text>
        <Text style={[styles.miniMarkSmall, styles.miniMarkBottomLeft, { color: accent }]}>✿</Text>
      </View>
    );
  }
  if (id === "starry-sky") {
    return (
      <View pointerEvents="none" style={styles.miniDecorationLayer}>
        <Text style={[styles.miniMark, styles.miniMarkTopRight, { color: accent }]}>★</Text>
        <View style={[styles.miniPlanet, { backgroundColor: secondary }]} />
        <Text style={[styles.miniMarkSmall, styles.miniMarkBottomLeft, { color: secondary }]}>✦</Text>
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={styles.miniDecorationLayer}>
      <Text style={[styles.miniMarkSmall, styles.miniMarkTopLeft, { color: accent }]}>♥</Text>
      <Text style={[styles.miniMark, styles.miniMarkTopRight, { color: secondary }]}>✦</Text>
      <Text style={[styles.miniMarkSmall, styles.miniMarkBottomLeft, { color: secondary }]}>✿</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: colors.scrimDark,
    zIndex: 0,
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: 16,
    shadowColor: colors.ink,
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    zIndex: 1,
    elevation: 12,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 14,
  },
  brand: {
    fontSize: 26,
    fontWeight: "800",
  },
  brandFont: {
    fontFamily: "PatrickHand",
    fontSize: 38,
    fontWeight: "400",
    lineHeight: 40,
  },
  headingCaption: {
    fontSize: 13,
    color: colors.mutedText,
    marginBottom: 8,
  },
  headingAction: {
    marginLeft: "auto",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 60,
    marginBottom: 2,
    overflow: "hidden",
  },
  rowMain: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  designButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
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
  newRowActive: {
    backgroundColor: "rgba(255,112,93,0.08)",
    borderColor: "rgba(255,112,93,0.32)",
  },
  rowActive: {
    borderWidth: 1.5,
    boxShadow: "0 3px 10px rgba(40,67,90,0.10)",
  },
  activeStripe: {
    position: "absolute",
    left: 0,
    top: 11,
    bottom: 11,
    width: 5,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  currentBadge: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 999,
    boxShadow: "0 2px 5px rgba(40,67,90,0.15)",
  },
  currentBadgeText: {
    color: "#FFFDF4",
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    fontSize: 16.5,
    fontWeight: "700",
    color: colors.ink,
  },
  rowMeta: {
    fontSize: 12.5,
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
  newIconActive: {
    borderStyle: "solid",
  },
  createBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15.5,
    color: colors.ink,
  },
  styleRow: {
    flexDirection: "row",
    gap: 10,
  },
  stylePreview: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    minWidth: 84,
  },
  styleLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedText,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 2,
  },
  designChooserContent: {
    paddingBottom: 28,
    gap: 12,
  },
  designPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  designPreviewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  designPreviewText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.mutedText,
    marginTop: 2,
  },
  layoutChoiceRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  layoutChoiceLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
  },
  layoutPicker: {
    minWidth: 132,
    alignItems: "flex-end",
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
    borderWidth: 1,
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
    borderWidth: 2,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  visualOptionActive: {
    borderWidth: 2,
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(72,198,183,0.08)",
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
  colorRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  pageDot: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageDotActive: {
    borderWidth: 2.5,
    borderColor: colors.titleCoral,
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
  createBtn: {
    backgroundColor: colors.fab,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  createBtnPressed: {
    backgroundColor: colors.fabPressed,
    transform: [{ scale: 0.985 }],
  },
  createBtnText: {
    color: "#FFF7EE",
    fontSize: 15.5,
    fontWeight: "700",
  },
  saveLookButton: {
    marginTop: 2,
  },
  hint: {
    fontSize: 12,
    color: colors.mutedText,
    textAlign: "center",
    paddingVertical: 12,
  },
});
