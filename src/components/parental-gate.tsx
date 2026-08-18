import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";

import { HapticPressable as Pressable } from "@/components/haptic-pressable";
import { useParentalGate } from "@/store/parental-gate";
import { colors } from "@/theme";

export function ParentalGateHost() {
  const confirmation = useParentalGate((state) => state.confirmation);
  const confirm = useParentalGate((state) => state.confirm);
  const cancel = useParentalGate((state) => state.cancel);
  const busy = useParentalGate((state) => state.busy);
  const error = useParentalGate((state) => state.error);

  if (!confirmation) return null;

  const content = (
    <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>GROWN-UPS ONLY</Text>
          <Text style={styles.title}>Confirm with this device</Text>
          <Text style={styles.copy}>{confirmation?.reason}</Text>
          <View style={styles.deviceNotice}>
            <Text style={styles.deviceNoticeTitle}>Face ID, Touch ID, or device passcode</Text>
            <Text style={styles.deviceNoticeCopy}>
              Buki asks iOS to confirm the device owner. Buki never receives or stores biometric data.
            </Text>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              disabled={busy}
              onPress={cancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel adult confirmation"
              style={({ pressed }) => [styles.secondary, (pressed || busy) && styles.pressed]}
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Verify adult with device authentication"
              disabled={busy}
              onPress={() => void confirm()}
              style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryLabel}>Verify adult</Text>}
            </Pressable>
          </View>
        </View>
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        {content}
      </FullWindowOverlay>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,38,43,0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderCurve: "continuous",
    padding: 22,
    gap: 12,
    boxShadow: "0 18px 48px rgba(22,36,44,0.24)",
  },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1, color: colors.titleCoral },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  copy: { fontSize: 15, lineHeight: 21, color: colors.mutedText },
  deviceNotice: {
    borderRadius: 15,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.page,
    padding: 14,
    gap: 5,
  },
  deviceNoticeTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  deviceNoticeCopy: { color: colors.mutedText, fontSize: 13, lineHeight: 18 },
  error: { color: "#A93232", fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 10, paddingTop: 4 },
  secondary: {
    width: 132,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  primary: {
    width: 132,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.titleTeal,
  },
  secondaryLabel: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  primaryLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.6, transform: [{ scale: 0.99 }] },
});
