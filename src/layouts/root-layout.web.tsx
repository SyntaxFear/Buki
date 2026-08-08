import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function PublicWebsiteLayout() {
  const dark = useColorScheme() === "dark";
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: dark ? "#122733" : "#FFF7E9" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Buki" }} />
        <Stack.Screen name="privacy" options={{ title: "Privacy Policy - Buki" }} />
        <Stack.Screen name="terms" options={{ title: "Terms of Use - Buki" }} />
        <Stack.Screen name="support" options={{ title: "Buki Support" }} />
        <Stack.Screen name="delete-account" options={{ title: "Delete your Buki account" }} />
      </Stack>
    </>
  );
}
