import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { BUKI_DATABASE_NAME, initializeBukiDatabase } from "@/database";
import { ParentalGateHost } from "@/components/parental-gate";
import { useDrawings } from "@/store/drawings";
import { useAuth } from "@/store/auth";
import { useProfiles } from "@/store/profiles";
import { usePreferences } from "@/store/preferences";
import { colors, PATRICK_HAND } from "@/theme";

// Module scope, unawaited: called any later (e.g. inside the component) risks
// the splash screen having already auto-hidden before we ask it to wait.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 400, fade: true });

// Always rebuild the stack with Home underneath, even when dev route
// restoration or a deep link lands directly on /scan.
export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={BUKI_DATABASE_NAME} onInit={initializeBukiDatabase}>
      <ReadyApp />
    </SQLiteProvider>
  );
}

function ReadyApp() {
  const [fontsLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const hydrated = useDrawings((s) => s.hydrated);
  const hydrate = useDrawings((s) => s.hydrate);
  const authHydrated = useAuth((s) => s.hydrated);
  const initializeAuth = useAuth((s) => s.initialize);
  const profilesHydrated = useProfiles((s) => s.hydrated);
  const hydrateProfiles = useProfiles((s) => s.hydrate);
  const preferencesHydrated = usePreferences((s) => s.hydrated);
  const hydratePreferences = usePreferences((s) => s.hydrate);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    void (async () => {
      await initializeAuth();
      await hydrateProfiles();
      await hydratePreferences();
      await hydrate();
    })();
  }, [hydrate, hydratePreferences, hydrateProfiles, initializeAuth]);

  // The native splash stays up until every readiness signal — fonts for the
  // title/UI, and the sketchpad store — has actually landed, so it never
  // hands off to a still-loading frame.
  const ready = fontsLoaded && hydrated && authHydrated && profilesHydrated && preferencesHydrated;

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
        <Stack.Screen
          name="scan"
          options={{ presentation: "fullScreenModal", animation: "fade" }}
        />
        <Stack.Screen
          name="account"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
      </Stack>
      <ParentalGateHost />
    </GestureHandlerRootView>
  );
}
