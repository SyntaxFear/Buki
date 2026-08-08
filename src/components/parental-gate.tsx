import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useParentalGate } from "@/store/parental-gate";
import { colors } from "@/theme";

export function ParentalGateHost() {
  const challenge = useParentalGate((state) => state.challenge);
  const answer = useParentalGate((state) => state.answer);
  const cancel = useParentalGate((state) => state.cancel);
  const [value, setValue] = useState("");
  const [incorrect, setIncorrect] = useState(false);

  useEffect(() => {
    setValue("");
    setIncorrect(false);
  }, [challenge]);

  return (
    <Modal visible={Boolean(challenge)} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>GROWN-UPS ONLY</Text>
          <Text style={styles.title}>Quick parent check</Text>
          <Text style={styles.copy}>{challenge?.reason}</Text>
          <Text style={styles.question}>
            What is {challenge?.left} + {challenge?.right}?
          </Text>
          <TextInput
            value={value}
            onChangeText={(next) => {
              setValue(next);
              setIncorrect(false);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={3}
            style={[styles.input, incorrect && styles.inputError]}
            accessibilityLabel="Parent check answer"
          />
          {incorrect ? (
            <Text accessibilityRole="alert" style={styles.error}>
              That answer does not match. Please try again.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable onPress={cancel} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!answer(value)) setIncorrect(true);
              }}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryLabel}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  question: { fontSize: 20, fontWeight: "800", color: colors.ink, paddingTop: 4 },
  input: {
    minHeight: 54,
    borderRadius: 15,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.page,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
  },
  inputError: { borderColor: "#B23B3B" },
  error: { color: "#A93232", fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, paddingTop: 4 },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  primary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.titleTeal,
  },
  secondaryLabel: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  primaryLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
