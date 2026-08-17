import {
  getHomeDrawerOptions,
  HOME_DRAWER_DETACH_INACTIVE_SCREENS,
  shouldUseHomeDrawer,
} from "./home-drawer-options";

describe("Home drawer stability options", () => {
  it("keeps the Home scene attached and stationary", () => {
    const options = getHomeDrawerOptions(336);

    expect(HOME_DRAWER_DETACH_INACTIVE_SCREENS).toBe(false);
    expect(options.drawerType).toBe("front");
    expect(options.lazy).toBe(false);
    expect(options.freezeOnBlur).toBe(false);
    expect(options.drawerStyle.width).toBe(336);
    expect(options.swipeEnabled).toBe(true);
  });

  it("keeps authentication and onboarding outside the drawer", () => {
    expect(shouldUseHomeDrawer(false, false)).toBe(false);
    expect(shouldUseHomeDrawer(true, false)).toBe(false);
    expect(shouldUseHomeDrawer(true, true)).toBe(true);
  });

  it("keeps the navigator mounted while disabling its gesture during onboarding", () => {
    expect(getHomeDrawerOptions(336, false).swipeEnabled).toBe(false);
  });
});
