import { useFonts } from "expo-font";
import { Stack } from "expo-router/stack";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ParentalGateHost } from "@/components/parental-gate";
import { ProPaywallHost } from "@/components/pro-paywall";
import { BUKI_DATABASE_NAME, initializeBukiDatabase } from "@/database";
import { useAuth } from "@/store/auth";
import { useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { usePreferences } from "@/store/preferences";
import { useProfiles } from "@/store/profiles";
import { colors, PATRICK_HAND } from "@/theme";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 400, fade: true });

export const unstable_settings = {
  initialRouteName: "index",
};

export default function NativeRootLayout() {
  return (
    <SQLiteProvider databaseName={BUKI_DATABASE_NAME} onInit={initializeBukiDatabase}>
      <ReadyApp />
    </SQLiteProvider>
  );
}

function ReadyApp() {
  const [fontsLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const hydrated = useDrawings((state) => state.hydrated);
  const hydrate = useDrawings((state) => state.hydrate);
  const authHydrated = useAuth((state) => state.hydrated);
  const initializeAuth = useAuth((state) => state.initialize);
  const profilesHydrated = useProfiles((state) => state.hydrated);
  const hydrateProfiles = useProfiles((state) => state.hydrate);
  const preferencesHydrated = usePreferences((state) => state.hydrated);
  const hydratePreferences = usePreferences((state) => state.hydrate);
  const membershipHydrated = useMembership((state) => state.hydrated);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    void (async () => {
      await initializeAuth();
      await hydrateProfiles();
      await hydratePreferences();
      await hydrate();
    })();
  }, [hydrate, hydratePreferences, hydrateProfiles, initializeAuth]);

  const ready =
    fontsLoaded &&
    hydrated &&
    authHydrated &&
    profilesHydrated &&
    preferencesHydrated &&
    membershipHydrated;

  useEffect(() => {
    if (ready && !splashHidden) {
      setSplashHidden(true);
      SplashScreen.hide();
    }
  }, [ready, splashHidden]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        <Stack.Screen
          name="account"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="library"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="exports"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="artwork"
          options={{
            presentation: "formSheet",
            animation: "slide_from_bottom",
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.86, 1],
          }}
        />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="support" />
        <Stack.Screen name="delete-account" />
      </Stack>
      <ProPaywallHost />
      <ParentalGateHost />
    </GestureHandlerRootView>
  );
}
