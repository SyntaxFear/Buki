import { useFonts } from "expo-font";
import { Stack } from "expo-router/stack";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ParentalGateHost } from "@/components/parental-gate";
import { ProPaywallHost } from "@/components/pro-paywall";
import { StartupSplashReveal } from "@/components/startup-splash-reveal";
import { BUKI_DATABASE_NAME, initializeBukiDatabase } from "@/database";
import { useAuth } from "@/store/auth";
import { activeDrawingsOf, activePadOf, useDrawings } from "@/store/drawings";
import { useMembership } from "@/store/membership";
import { usePreferences } from "@/store/preferences";
import { useProfiles } from "@/store/profiles";
import { colors, PATRICK_HAND } from "@/theme";
import { HapticProvider } from "@/utils/haptics";
import { preloadCachedImage } from "@/utils/image-cache";
import {
  finalSketchpadUnit,
  sketchpadUnitImageUris,
} from "@/utils/page-session";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 0, fade: false });

export const unstable_settings = {
  initialRouteName: "(home)",
};

export default function NativeRootLayout() {
  return (
    <SQLiteProvider
      databaseName={BUKI_DATABASE_NAME}
      onInit={initializeBukiDatabase}
    >
      <HapticProvider>
        <KeyboardProvider preload={false}>
          <ReadyApp />
        </KeyboardProvider>
      </HapticProvider>
    </SQLiteProvider>
  );
}

function ReadyApp() {
  const [fontsLoaded, fontError] = useFonts({ PatrickHand: PATRICK_HAND });
  const hydrated = useDrawings((state) => state.hydrated);
  const hydrate = useDrawings((state) => state.hydrate);
  const authHydrated = useAuth((state) => state.hydrated);
  const signedIn = useAuth((state) => state.status === "signedIn");
  const initializeAuth = useAuth((state) => state.initialize);
  const profilesHydrated = useProfiles((state) => state.hydrated);
  const onboardingComplete = useProfiles(
    (state) => state.onboardingComplete,
  );
  const hydrateProfiles = useProfiles((state) => state.hydrate);
  const preferencesHydrated = usePreferences((state) => state.hydrated);
  const hydratePreferences = usePreferences((state) => state.hydrate);
  const membershipHydrated = useMembership((state) => state.hydrated);
  const [initialPageReady, setInitialPageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await initializeAuth();
        await Promise.all([hydrateProfiles(), hydratePreferences(), hydrate()]);
        const drawingState = useDrawings.getState();
        const activePad = activePadOf(drawingState);
        const activeDrawings = activeDrawingsOf(drawingState);
        const syntheticCapture =
          __DEV__ && process.env.EXPO_PUBLIC_BIP_SYNTHETIC_MODE === "1";
        if (activePad && !syntheticCapture) {
          const finalUnit = finalSketchpadUnit(
            activeDrawings.length,
            activePad.style,
          );
          const initialUris = sketchpadUnitImageUris(
            activeDrawings,
            finalUnit,
            activePad.style,
          );
          await Promise.all(initialUris.map((uri) => preloadCachedImage(uri)));
        }
      } catch (error) {
        console.error("Buki startup hydration failed", error);
      } finally {
        if (!cancelled) setInitialPageReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, hydratePreferences, hydrateProfiles, initializeAuth]);

  const syntheticCapture =
    __DEV__ && process.env.EXPO_PUBLIC_BIP_SYNTHETIC_MODE === "1";
  const ready =
    (fontsLoaded || Boolean(fontError) || syntheticCapture) &&
    hydrated &&
    authHydrated &&
    profilesHydrated &&
    preferencesHydrated &&
    membershipHydrated &&
    initialPageReady;

  if (!ready) return null;

  return (
    <StartupSplashReveal
      transitionToHeaderMascot={signedIn && onboardingComplete}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(home)" />
          <Stack.Screen
            name="sketchpad-editor"
            options={{
              presentation: "formSheet",
              headerShown: true,
              headerBackVisible: false,
              sheetAllowedDetents: [1],
              sheetInitialDetentIndex: 0,
              sheetGrabberVisible: true,
              sheetExpandsWhenScrolledToEdge: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="scan"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
          <Stack.Screen
            name="account"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
              headerShown: true,
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="library"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
              headerShown: true,
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="exports"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
              headerShown: true,
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="artwork"
            options={{
              presentation: "formSheet",
              animation: "slide_from_bottom",
              headerShown: true,
              headerBackVisible: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.86, 1],
            }}
          />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="terms" />
          <Stack.Screen name="support" />
          <Stack.Screen name="delete-account" />
          <Stack.Screen name="auth/callback" options={{ animation: "fade" }} />
        </Stack>
        <ProPaywallHost />
        <ParentalGateHost />
      </GestureHandlerRootView>
    </StartupSplashReveal>
  );
}
