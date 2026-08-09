import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { oauthCallbackUrlFromRouteParams } from "@/auth/oauth";
import { useAuth } from "@/store/auth";
import { colors } from "@/theme";

export default function AuthCallbackRoute() {
  const url = Linking.useURL();
  const params = useLocalSearchParams();
  const completeAuthCallback = useAuth((state) => state.completeAuthCallback);
  const busy = useAuth((state) => state.busy);
  const error = useAuth((state) => state.error);
  const handledUrl = useRef<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeCallbackUrl = oauthCallbackUrlFromRouteParams(params);
  const callbackUrl = routeCallbackUrl ?? url;

  useEffect(() => {
    if (!callbackUrl) {
      setRouteError("Authentication did not return a usable session.");
      return;
    }
    if (handledUrl.current === callbackUrl) return;
    handledUrl.current = callbackUrl;
    setRouteError(null);
    void completeAuthCallback(callbackUrl).then((completed) => {
      if (completed) {
        router.replace("/");
      } else {
        setRouteError(
          "This sign-in link could not be completed. Request a new link and try again.",
        );
      }
    });
  }, [callbackUrl, completeAuthCallback]);

  const visibleError = error ?? routeError;

  return (
    <View style={styles.screen}>
      {busy || !visibleError ? <ActivityIndicator color={colors.titleTeal} size="large" /> : null}
      <Text accessibilityRole="header" style={styles.title}>
        {visibleError ? "Sign-in link could not be completed" : "Finishing sign in"}
      </Text>
      <Text selectable accessibilityRole={visibleError ? "alert" : undefined} style={styles.copy}>
        {visibleError ?? "Buki is securely connecting this device to your adult account."}
      </Text>
      {visibleError ? (
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
