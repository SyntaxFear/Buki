import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useDrawings } from "@/store/drawings";
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
  const [fontsLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const hydrated = useDrawings((s) => s.hydrated);
  const hydrate = useDrawings((s) => s.hydrate);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // The native splash stays up until every readiness signal — fonts for the
  // title/UI, and the sketchpad store — has actually landed, so it never
  // hands off to a still-loading frame.
  const ready = fontsLoaded && hydrated;

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
      </Stack>
    </GestureHandlerRootView>
  );
}
