import { Drawer } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";

import { PadDrawerContent } from "@/components/pad-drawer";
import {
  getHomeDrawerOptions,
  HOME_DRAWER_DETACH_INACTIVE_SCREENS,
  shouldUseHomeDrawer,
} from "@/layouts/home-drawer-options";
import { useAuth } from "@/store/auth";
import { useProfiles } from "@/store/profiles";

const DRAWER_MAX_WIDTH = 352;
const DRAWER_SCREEN_GUTTER = 16;

export default function HomeDrawerLayout() {
  const { width } = useWindowDimensions();
  const signedIn = useAuth((state) => state.status === "signedIn");
  const onboardingComplete = useProfiles((state) => state.onboardingComplete);
  const drawerWidth = Math.min(
    DRAWER_MAX_WIDTH,
    Math.max(0, width - DRAWER_SCREEN_GUTTER),
  );

  const drawerEnabled = shouldUseHomeDrawer(signedIn, onboardingComplete);

  return (
    <Drawer
      detachInactiveScreens={HOME_DRAWER_DETACH_INACTIVE_SCREENS}
      drawerContent={({ navigation }) =>
        drawerEnabled ? (
          <PadDrawerContent onClose={() => navigation.closeDrawer()} />
        ) : null
      }
      screenOptions={getHomeDrawerOptions(drawerWidth, drawerEnabled)}
    >
      <Drawer.Screen
        name="index"
        options={{ title: "Buki", drawerLabel: "Sketchpads" }}
      />
    </Drawer>
  );
}
