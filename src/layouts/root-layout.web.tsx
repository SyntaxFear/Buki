import { useFonts } from "expo-font";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";

import { colors, PATRICK_HAND } from "@/theme";

export const unstable_settings = {
  initialRouteName: "(home)",
};

export default function PublicWebsiteLayout() {
  useFonts({ PatrickHand: PATRICK_HAND });
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(home)" options={{ title: "Buki" }} />
        <Stack.Screen
          name="privacy"
          options={{ title: "Privacy Policy - Buki" }}
        />
        <Stack.Screen name="terms" options={{ title: "Terms of Use - Buki" }} />
        <Stack.Screen name="support" options={{ title: "Buki Support" }} />
        <Stack.Screen
          name="delete-account"
          options={{ title: "Delete your Buki account" }}
        />
      </Stack>
    </>
  );
}
