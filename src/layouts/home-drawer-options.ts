import { colors } from "@/theme";

export const HOME_DRAWER_DETACH_INACTIVE_SCREENS = false;

export function shouldUseHomeDrawer(
  signedIn: boolean,
  onboardingComplete: boolean,
) {
  return signedIn && onboardingComplete;
}

export function getHomeDrawerOptions(drawerWidth: number, enabled = true) {
  return {
    headerShown: false,
    lazy: false,
    freezeOnBlur: false,
    drawerType: "front" as const,
    drawerHideStatusBarOnOpen: false,
    drawerStyle: {
      width: drawerWidth,
      backgroundColor: colors.background,
      overflow: "hidden" as const,
    },
    sceneStyle: { backgroundColor: colors.background },
    overlayColor: colors.scrimDark,
    overlayAccessibilityLabel: "Close sketchpads",
    swipeEnabled: enabled,
    swipeEdgeWidth: 24,
    swipeMinDistance: 40,
  };
}
