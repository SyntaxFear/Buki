import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useDrawings } from "@/store/drawings";
import { colors, PATRICK_HAND } from "@/theme";

// Always rebuild the stack with Home underneath, even when dev route
// restoration or a deep link lands directly on /scan.
export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PatrickHand: PATRICK_HAND });
  const hydrate = useDrawings((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!fontsLoaded) return null;

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
