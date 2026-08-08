import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/store/auth";
import { colors } from "@/theme";

export default function AuthCallbackRoute() {
  const url = Linking.useURL();
  const completeAuthCallback = useAuth((state) => state.completeAuthCallback);
  const busy = useAuth((state) => state.busy);
  const error = useAuth((state) => state.error);
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handledUrl.current === url) return;
    handledUrl.current = url;
    void completeAuthCallback(url).then((completed) => {
      if (completed) router.replace("/");
    });
  }, [completeAuthCallback, url]);

  return (
    <View style={styles.screen}>
      {busy || !error ? <ActivityIndicator color={colors.titleTeal} size="large" /> : null}
      <Text accessibilityRole="header" style={styles.title}>
        {error ? "Sign-in link could not be completed" : "Finishing sign in"}
      </Text>
      <Text selectable accessibilityRole={error ? "alert" : undefined} style={styles.copy}>
        {error ?? "Buki is securely connecting this device to your adult account."}
      </Text>
      {error ? (
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.button}>
          <Text style={styles.buttonLabel}>Back to sign in</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 28,
    backgroundColor: colors.background,
  },
  title: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: "800", textAlign: "center" },
  copy: { color: colors.mutedText, fontSize: 16, lineHeight: 23, textAlign: "center", maxWidth: 420 },
  button: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: colors.titleTeal,
  },
  buttonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
