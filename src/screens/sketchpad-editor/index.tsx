import { Host, Picker } from "@expo/ui";
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DesignGrid,
  MiniCover,
  STYLE_LABEL,
  VisualOptionGrid,
} from "@/components/pad-drawer";
import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { NativeCloseHeader } from "@/components/native-navigation-header";
import { getPadDesign, type PadDesignId } from "@/pad-designs";
import {
  DEFAULT_PAD_ICON_ID,
  PAD_ICONS,
  type PadIconId,
} from "@/pad-icons";
import {
  PAD_BORDERS,
  PAD_DECORATIONS,
  type PadBorderId,
  type PadDecorationId,
} from "@/pad-visuals";
import {
  DEFAULT_PAD_STYLE,
  useDrawings,
  type PadStyle,
  type Sketchpad,
} from "@/store/drawings";
import { useProfiles } from "@/store/profiles";
import { colors, PAGE_COLORS } from "@/theme";
import {
  Haptics,
  impactHaptic,
} from "@/utils/haptics";
import { dismissKeyboard, keyboardDismissMode } from "@/utils/keyboard";
import {
  firstRouteParam,
  resolveSketchpadEditorMode,
  type SketchpadEditorMode,
} from "./editor-mode";

const PAPER_NAMES = [
  "Cream",
  "Mint",
  "Sky",
  "Blush",
  "Butter",
  "Lavender",
] as const;
const DEFAULT_DESIGN: PadDesignId = "sunshine";
const COMPACT_TEXT_SCALE = 1.35;
const SUBMIT_BUTTON_MIN_HEIGHT = 52;
const FOOTER_TOP_PADDING = 10;
const FOOTER_SCROLL_GAP = 18;

export function SketchpadEditorScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    mode?: string | string[];
  }>();
  const padId = firstRouteParam(params.id);
  const mode = resolveSketchpadEditorMode(firstRouteParam(params.mode), padId);
  const editingPadId = mode === "edit" ? padId : undefined;
  const pad = useDrawings((state) =>
    editingPadId
      ? state.pads.find((item) => item.id === editingPadId)
      : undefined,
  );
  const formKey =
    mode === "create"
      ? "create"
      : pad
        ? `edit:${pad.id}:ready`
        : `edit:${editingPadId ?? "missing"}:missing`;

  return <SketchpadEditorForm key={formKey} mode={mode} pad={pad} />;
}

function SketchpadEditorForm({
  mode,
  pad,
}: {
  mode: SketchpadEditorMode;
  pad: Sketchpad | undefined;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const useAccessibleLayout = windowWidth < 360 || fontScale >= 1.6;
  const createPad = useDrawings((state) => state.createPad);
  const updatePad = useDrawings((state) => state.updatePad);
  const activeChildId = useProfiles((state) => state.activeChildId);
  const sketchpadChild = useProfiles((state) =>
    state.children.find(
      (child) => child.id === (pad?.childId ?? state.activeChildId),
    ),
  );

  const [name, setName] = useState(pad?.name ?? "");
  const [style, setStyle] = useState<PadStyle>(pad?.style ?? DEFAULT_PAD_STYLE);
  const [design, setDesign] = useState<PadDesignId>(
    pad?.design ?? DEFAULT_DESIGN,
  );
  const [border, setBorder] = useState<PadBorderId>(pad?.border ?? "none");
  const [decoration, setDecoration] = useState<PadDecorationId>(
    pad?.decoration ?? "none",
  );
  const [icon, setIcon] = useState<PadIconId>(
    pad?.icon ?? DEFAULT_PAD_ICON_ID,
  );
  const [pageColor, setPageColor] = useState(
    pad?.pageColor ?? getPadDesign(pad?.design ?? DEFAULT_DESIGN).paper,
  );

  const editing = mode === "edit";
  const selectedDesign = getPadDesign(design);
  const displayName = name.trim() || "My Book";
  const submitLabel = editing ? "Save changes" : "Create sketchpad";
  const footerBottomPadding = Math.max(insets.bottom, 12);
  const scrollContentBottomPadding =
    SUBMIT_BUTTON_MIN_HEIGHT +
    FOOTER_TOP_PADDING +
    footerBottomPadding +
    FOOTER_SCROLL_GAP;
  const allowDismiss = useRef(false);
  const discardPromptOpen = useRef(false);
  const hasUnsavedChanges = editing
    ? Boolean(
        pad &&
        (displayName !== pad.name ||
          style !== pad.style ||
          design !== pad.design ||
          border !== pad.border ||
          decoration !== pad.decoration ||
          icon !== (pad.icon ?? DEFAULT_PAD_ICON_ID) ||
          pageColor !== (pad.pageColor ?? getPadDesign(pad.design).paper)),
      )
    : Boolean(
        name.trim() ||
        style !== DEFAULT_PAD_STYLE ||
        design !== DEFAULT_DESIGN ||
        border !== "none" ||
        decoration !== "none" ||
        icon !== DEFAULT_PAD_ICON_ID ||
        pageColor !== getPadDesign(DEFAULT_DESIGN).paper,
      );

  usePreventRemove(hasUnsavedChanges, ({ data }) => {
    if (allowDismiss.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (discardPromptOpen.current) return;

    discardPromptOpen.current = true;
    Alert.alert(
      "Discard sketchpad changes?",
      "Your name and design choices have not been saved.",
      [
        {
          text: "Keep editing",
          style: "cancel",
          onPress: () => {
            discardPromptOpen.current = false;
          },
        },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            allowDismiss.current = true;
            discardPromptOpen.current = false;
            navigation.dispatch(data.action);
          },
        },
      ],
    );
  });

  const submit = () => {
    if (pad) {
      const saved = updatePad(pad.id, {
        name: displayName,
        style,
        design,
        border,
        decoration,
        icon,
        pageColor,
      });
      if (!saved) return;
    } else {
      const created = createPad(
        name,
        style,
        design,
        pageColor,
        activeChildId ?? undefined,
        border,
        decoration,
        icon,
      );
      if (!created) return;
    }

    impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    allowDismiss.current = true;
    router.back();
  };

  if (editing && !pad) {
    return (
      <>
        <NativeCloseHeader
          title="Sketchpad"
          eyebrow="SKETCHPAD"
          accessibilityLabel="Close sketchpad editor"
          onPress={() => router.back()}
        />
        <View style={styles.missingRoot}>
          <SymbolView
            name="books.vertical"
            size={34}
            tintColor={colors.mutedText}
          />
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={styles.missingTitle}
          >
            Sketchpad not found
          </Text>
          <Text
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            style={styles.missingBody}
          >
            It may have been removed from this Child Profile.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close sketchpad editor"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.secondaryButtonText}
            >
              Close
            </Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <NativeCloseHeader
        title={editing ? "Edit sketchpad" : "New sketchpad"}
        eyebrow="SKETCHPAD"
        accessibilityLabel="Close sketchpad editor"
        onPress={() => router.back()}
        gestureEnabled={!hasUnsavedChanges}
      />

      <View style={styles.root}>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          bottomOffset={scrollContentBottomPadding}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode={keyboardDismissMode}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: scrollContentBottomPadding },
          ]}
        >
          <View
            style={[
              styles.previewCard,
              useAccessibleLayout && styles.previewCardStacked,
            ]}
          >
            <View
              style={[
                styles.previewArt,
                useAccessibleLayout && styles.previewArtStacked,
                { backgroundColor: pageColor },
              ]}
            >
              <MiniCover
                style={style}
                design={design}
                pageColor={pageColor}
                border={border}
                decoration={decoration}
                scale={2}
              />
            </View>
            <View style={styles.previewCopy}>
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={styles.previewEyebrow}
              >
                {sketchpadChild
                  ? `For ${sketchpadChild.name}`
                  : "Sketchpad preview"}
              </Text>
              <Text
                style={styles.previewTitle}
                numberOfLines={2}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                {displayName}
              </Text>
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={styles.previewMeta}
              >
                {STYLE_LABEL[style]} · {selectedDesign.name}
              </Text>
            </View>
          </View>

          <View style={styles.formSection}>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.sectionLabel}
            >
              Drawer icon
            </Text>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.helperText}
            >
              Choose the icon shown beside this sketchpad in your shelf.
            </Text>
            <View style={styles.iconGrid}>
              {PAD_ICONS.map((option) => {
                const selected = icon === option.id;
                return (
                  <Pressable
                    key={option.id}
                    haptic={selected ? false : "selection"}
                    onPress={() => setIcon(option.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.name} sketchpad icon`}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.iconOption,
                      selected && styles.iconOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.iconPreview,
                        {
                          backgroundColor: selectedDesign.paper,
                          borderColor: selected
                            ? selectedDesign.cover
                            : colors.border,
                        },
                      ]}
                    >
                      {option.id === "cover" ? (
                        <MiniCover
                          style={style}
                          design={design}
                          pageColor={pageColor}
                          border={border}
                          decoration={decoration}
                          scale={0.58}
                        />
                      ) : (
                        <SymbolView
                          name={option.symbol}
                          size={21}
                          tintColor={selectedDesign.coverDark}
                          weight="semibold"
                        />
                      )}
                      {selected ? (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.iconCheck,
                            { backgroundColor: selectedDesign.cover },
                          ]}
                        >
                          <SymbolView
                            name="checkmark"
                            size={8}
                            tintColor={colors.surface}
                            weight="bold"
                          />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={styles.iconName}
                    >
                      {option.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.formSection}>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.sectionLabel}
            >
              Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="My Book"
              placeholderTextColor="#A59A89"
              accessibilityLabel="Sketchpad name"
              autoCapitalize="words"
              autoCorrect
              clearButtonMode="while-editing"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={dismissKeyboard}
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.nameInput}
            />
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.helperText}
            >
              {editing
                ? "Change the name shown in your sketchpad drawer. Leave it blank to use “My Book.”"
                : "Leave this blank and Buki will call it “My Book.”"}
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.sectionLabel}
            >
              Layout
            </Text>
            <View
              style={[
                styles.layoutRow,
                useAccessibleLayout && styles.layoutRowStacked,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  style={styles.layoutTitle}
                >
                  {STYLE_LABEL[style]}
                </Text>
                <Text
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  style={styles.helperText}
                >
                  {style === "vertical"
                    ? "One artwork per portrait page, shown larger and easier to enjoy."
                    : "Choose how artwork is arranged and flipped."}
                </Text>
              </View>
              <View
                style={[
                  styles.layoutPicker,
                  useAccessibleLayout && styles.layoutPickerStacked,
                ]}
              >
                <Host matchContents>
                  <Picker
                    selectedValue={style}
                    onValueChange={(value) => {
                      const nextStyle = value as PadStyle;
                      setStyle(nextStyle);
                    }}
                  >
                    <Picker.Item label="Vertical pad" value="vertical" />
                    <Picker.Item label="Spread book" value="spread" />
                    <Picker.Item label="Album" value="album" />
                    <Picker.Item label="Photo grid" value="grid" />
                    <Picker.Item label="Filmstrip" value="strip" />
                  </Picker>
                </Host>
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View
              style={[
                styles.sectionHeadingRow,
                useAccessibleLayout && styles.sectionHeadingRowStacked,
              ]}
            >
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={styles.sectionLabel}
              >
                Theme
              </Text>
              <Text
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={[
                  styles.sectionValue,
                  useAccessibleLayout && styles.sectionValueStacked,
                ]}
              >
                {selectedDesign.tagline}
              </Text>
            </View>
            <DesignGrid
              style={style}
              selected={design}
              onSelect={(nextDesign) => {
                setDesign(nextDesign);
                setPageColor(getPadDesign(nextDesign).paper);
              }}
            />
          </View>

          <View style={styles.formSection}>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.sectionLabel}
            >
              Artwork border
            </Text>
            <VisualOptionGrid
              kind="border"
              options={PAD_BORDERS}
              selected={border}
              onSelect={setBorder}
            />
          </View>

          <View style={styles.formSection}>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.sectionLabel}
            >
              Decorations
            </Text>
            <VisualOptionGrid
              kind="decoration"
              options={PAD_DECORATIONS}
              selected={decoration}
              onSelect={setDecoration}
            />
          </View>

          <View style={styles.formSection}>
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.sectionLabel}
            >
              Paper
            </Text>
            <View style={styles.paperRow}>
              {PAGE_COLORS.map((color, index) => {
                const selected = pageColor === color;
                return (
                  <Pressable
                    key={color}
                    haptic={selected ? false : "selection"}
                    onPress={() => setPageColor(color)}
                    accessibilityRole="radio"
                    accessibilityLabel={`${PAPER_NAMES[index]} paper`}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.paperOption,
                      selected && styles.paperOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[styles.paperSwatch, { backgroundColor: color }]}
                    >
                      {selected ? (
                        <SymbolView
                          name="checkmark"
                          size={13}
                          tintColor={colors.titleTeal}
                        />
                      ) : null}
                    </View>
                    <Text
                      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                      style={styles.paperName}
                    >
                      {PAPER_NAMES[index]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.proNote}>
            <SymbolView
              name="sparkles"
              size={17}
              tintColor={colors.titleYellow}
            />
            <Text
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              style={styles.proNoteText}
            >
              You can preview every look. Buki asks for Pro only when a premium
              choice is saved.
            </Text>
          </View>
        </KeyboardAwareScrollView>

        <KeyboardStickyView>
          <View
            style={[
              styles.footer,
              { paddingBottom: footerBottomPadding },
            ]}
          >
            <Pressable
              haptic={false}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && styles.submitButtonPressed,
              ]}
            >
              <SymbolView
                name={editing ? "checkmark" : "plus"}
                size={17}
                tintColor={colors.surface}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                style={styles.submitButtonText}
              >
                {submitLabel}
              </Text>
            </Pressable>
          </View>
        </KeyboardStickyView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    gap: 22,
  },
  previewCard: {
    minHeight: 126,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0 8px 24px rgba(40,67,90,0.09)",
  },
  previewCardStacked: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  previewArt: {
    width: 112,
    height: 94,
    borderRadius: 20,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewArtStacked: {
    width: "100%",
    height: 104,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  previewEyebrow: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.titleTeal,
  },
  previewTitle: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    color: colors.ink,
  },
  previewMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedText,
  },
  formSection: {
    gap: 10,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionHeadingRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.ink,
  },
  sectionValue: {
    flexShrink: 1,
    fontSize: 12.5,
    color: colors.mutedText,
    textAlign: "right",
  },
  sectionValueStacked: {
    textAlign: "left",
  },
  nameInput: {
    minHeight: 52,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
  helperText: {
    flexShrink: 1,
    alignSelf: "stretch",
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.mutedText,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconOption: {
    minWidth: 70,
    minHeight: 78,
    flexGrow: 1,
    flexBasis: "22%",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 6,
    paddingVertical: 9,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  iconOptionSelected: {
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(22,125,130,0.06)",
  },
  iconPreview: {
    position: "relative",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  iconCheck: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconName: {
    maxWidth: "100%",
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.ink,
  },
  layoutRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingVertical: 8,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  layoutRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  layoutTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  layoutPicker: {
    minWidth: 136,
    alignItems: "flex-end",
  },
  layoutPickerStacked: {
    minWidth: 0,
    alignItems: "stretch",
  },
  paperRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  paperOption: {
    minWidth: 76,
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  paperOptionSelected: {
    borderColor: colors.titleTeal,
    backgroundColor: "rgba(22,125,130,0.06)",
  },
  paperSwatch: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(40,67,90,0.14)",
  },
  paperName: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.ink,
  },
  proNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: "rgba(244,184,63,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,184,63,0.28)",
  },
  proNoteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.mutedText,
  },
  footer: {
    paddingTop: FOOTER_TOP_PADDING,
    paddingHorizontal: 18,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  submitButton: {
    minHeight: SUBMIT_BUTTON_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: colors.fab,
    boxShadow: "0 7px 18px rgba(122,84,59,0.20)",
  },
  submitButtonPressed: {
    backgroundColor: colors.fabPressed,
    transform: [{ scale: 0.985 }],
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.surface,
  },
  pressed: {
    opacity: 0.72,
  },
  missingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 28,
    backgroundColor: colors.background,
  },
  missingTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: colors.ink,
  },
  missingBody: {
    maxWidth: 290,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: colors.mutedText,
  },
  secondaryButton: {
    minHeight: 46,
    marginTop: 8,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.titleTeal,
  },
});
