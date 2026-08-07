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
import { colors, PAD_COLORS, PAGE_COLORS, PATRICK_HAND } from "@/theme";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PANEL_W = 300;

const STYLE_LABEL: Record<PadStyle, string> = {
  spread: "Spread book",
  vertical: "Vertical pad",
  album: "Album",
  grid: "Photo grid",
  strip: "Filmstrip",
};

export function PadDrawer({ open, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const pads = useDrawings((s) => s.pads);
  const activePadId = useDrawings((s) => s.activePadId);
  const drawingsByPad = useDrawings((s) => s.drawingsByPad);
  const setActivePad = useDrawings((s) => s.setActivePad);
  const createPad = useDrawings((s) => s.createPad);
  const renamePad = useDrawings((s) => s.renamePad);
  const deletePad = useDrawings((s) => s.deletePad);

  const [brandFontLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStyle, setNewStyle] = useState<PadStyle>("spread");
  const [newColor, setNewColor] = useState<string>(PAD_COLORS[0].main);
  const [newPageColor, setNewPageColor] = useState<string>(PAGE_COLORS[0]);

  const anim = useSharedValue(0);
  useEffect(() => {
    anim.value = withTiming(open ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
    if (!open) setCreating(false);
  }, [open, anim]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(anim.value, [0, 1], [-PANEL_W - 20, 0]) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
  }));

  const submitCreate = () => {
    createPad(newName, newStyle, newColor, newPageColor);
    setNewName("");
    setCreating(false);
    onClose();
  };

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
          Alert.alert(
            `Delete “${pad.name}”?`,
            count > 0 ? `Its ${count} drawing${count === 1 ? "" : "s"} will be deleted too.` : undefined,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deletePad(pad.id) },
            ],
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.panel, { paddingTop: insets.top + 18 }, panelStyle]}>
        <View style={styles.headingRow}>
          <Text style={[styles.brand, brandFontLoaded && styles.brandFont]}>
            <Text style={{ color: colors.titleGreen }}>Bu</Text>
            <Text style={{ color: colors.titleCoral }}>ki</Text>
          </Text>
          <Text style={styles.headingCaption}>Sketchpads</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
          {pads.map((pad) => {
            const count = (drawingsByPad[pad.id] ?? []).length;
            const active = pad.id === activePadId;
            return (
              <Pressable
                key={pad.id}
                onPress={() => {
                  setActivePad(pad.id);
                  onClose();
                }}
                onLongPress={() => managePad(pad)}
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}
              >
                <MiniCover style={pad.style} color={pad.coverColor} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {pad.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {STYLE_LABEL[pad.style]} · {count}{" "}
                    {count === 1 ? "drawing" : "drawings"}
                  </Text>
                </View>
                {active ? <SymbolView name="checkmark.circle.fill" size={20} tintColor={colors.titleGreen} /> : null}
              </Pressable>
            );
          })}

          {creating ? (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={styles.createBox}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Sketchpad name"
                  placeholderTextColor="#B9AF9E"
                  style={styles.input}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitCreate}
                />
                <View style={styles.styleRow}>
                  <View style={styles.stylePreview}>
                    <MiniCover style={newStyle} color={newColor} />
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
                <View style={styles.colorRow}>
                  {PAD_COLORS.map((c) => (
                    <Pressable
                      key={c.main}
                      onPress={() => setNewColor(c.main)}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c.main },
                        newColor === c.main && styles.colorDotActive,
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.colorCaption}>Page color</Text>
                <View style={styles.colorRow}>
                  {PAGE_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setNewPageColor(c)}
                      style={[
                        styles.pageDot,
                        { backgroundColor: c },
                        newPageColor === c && styles.pageDotActive,
                      ]}
                    />
                  ))}
                </View>
                <Pressable onPress={submitCreate} style={styles.createBtn}>
                  <Text style={styles.createBtnText}>Create</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <View style={styles.newIcon}>
                <SymbolView name="plus" size={18} tintColor={colors.titleCoral} />
              </View>
              <Text style={[styles.rowName, { color: colors.titleCoral }]}>New sketchpad</Text>
            </Pressable>
          )}
        </ScrollView>

        <Text style={styles.hint}>Long-press a sketchpad to rename or delete</Text>
      </Animated.View>
    </View>
  );
}

function MiniCover({ style, color }: { style: PadStyle; color: string }) {
  const wide = style === "spread" || style === "album";
  const w = wide ? 42 : 28;
  const h = wide ? 30 : 38;
  return (
    <View style={[styles.cover, { width: w, height: h, backgroundColor: color }]}>
      <View style={[styles.coverPage, style === "album" && { flexDirection: "row" }]}>
        {style === "spread" ? <View style={styles.coverSpine} /> : null}
        {style === "vertical" ? <View style={styles.coverRings} /> : null}
        {style === "album" ? <View style={styles.coverRingsLeft} /> : null}
        {style === "grid" ? (
          <View style={styles.coverGrid}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.coverGridDot} />
            ))}
          </View>
        ) : null}
        {style === "strip" ? (
          <View style={styles.coverStrip}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.coverStripLine} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: colors.scrimDark,
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: PANEL_W,
    backgroundColor: "#F4EFE3",
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: 16,
    shadowColor: "#4A3628",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
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
    color: "#8D8271",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  rowActive: {
    backgroundColor: "rgba(232,105,90,0.10)",
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    fontSize: 16.5,
    fontWeight: "700",
    color: "#4E4437",
  },
  rowMeta: {
    fontSize: 12.5,
    color: "#8D8271",
    marginTop: 1,
  },
  cover: {
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPage: {
    width: "72%",
    height: "70%",
    backgroundColor: colors.page,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  coverSpine: {
    width: 1.5,
    height: "78%",
    backgroundColor: "rgba(210,120,100,0.75)",
  },
  coverRings: {
    width: "70%",
    height: 1.5,
    backgroundColor: "rgba(150,130,110,0.6)",
    alignSelf: "center",
    marginTop: -10,
  },
  coverRingsLeft: {
    width: 1.5,
    height: "70%",
    backgroundColor: "rgba(150,130,110,0.6)",
    marginLeft: 2,
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
    backgroundColor: "rgba(150,130,110,0.55)",
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
  createBox: {
    backgroundColor: "#FFFDF6",
    borderRadius: 16,
    padding: 14,
    marginTop: 6,
    gap: 12,
  },
  input: {
    backgroundColor: "#F2EBDC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15.5,
    color: "#4E4437",
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
    color: "#6B6052",
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  colorCaption: {
    fontSize: 12,
    color: "#9A8F7D",
    textAlign: "center",
    marginTop: 2,
  },
  pageDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(150,130,110,0.35)",
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
    backgroundColor: "rgba(150,130,110,0.55)",
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "#FFFDF6",
    shadowColor: "#4A3628",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  createBtn: {
    backgroundColor: colors.fab,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  createBtnText: {
    color: "#FFF7EE",
    fontSize: 15.5,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
    color: "#9A8F7D",
    textAlign: "center",
    paddingVertical: 12,
  },
});
