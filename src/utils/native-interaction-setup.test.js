/* global __dirname, describe, expect, it */

const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function source(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function filesUnder(relativePath) {
  const root = path.join(ROOT, relativePath);
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !/\.(?:test|spec)\.[jt]sx?$/.test(file));
}

describe("native interaction setup", () => {
  it("keeps Tickle and Keyboard Controller installed in JavaScript and CocoaPods", () => {
    const packageJson = JSON.parse(source("package.json"));
    const podLock = source("ios/Podfile.lock");

    expect(packageJson.dependencies["@renegades/react-native-tickle"]).toBe(
      "0.1.2",
    );
    expect(packageJson.dependencies["react-native-keyboard-controller"]).toBe(
      "1.21.9",
    );
    expect(packageJson.dependencies["expo-haptics"]).toBe("~57.0.1");
    expect(podLock).toContain("Tickle (0.1.2)");
    expect(podLock).toContain("ExpoHaptics (57.0.1)");
    expect(podLock).toContain("react-native-keyboard-controller (1.21.9)");
  });

  it("allows Metro to select the platform haptics implementation", () => {
    const packageJson = JSON.parse(source("package.json"));

    expect(existsSync(path.join(ROOT, "src/utils/haptics.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/utils/haptics.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/utils/haptics.ios.tsx"))).toBe(true);
    expect(packageJson.jest.moduleNameMapper["^@/utils/haptics$"]).toBe(
      "<rootDir>/src/utils/haptics.tsx",
    );
  });

  it("provides keyboard-aware handling for every native input screen", () => {
    expect(source("src/layouts/root-layout.native.tsx")).toContain(
      "<KeyboardProvider preload={false}>",
    );
    for (const screen of [
      "src/screens/account/index.tsx",
      "src/screens/artwork/index.tsx",
      "src/screens/onboarding/index.tsx",
      "src/screens/sketchpad-editor/index.tsx",
    ]) {
      expect(source(screen)).toContain("KeyboardAwareScrollView");
      expect(source(screen)).toContain("keyboardDismissMode");
    }
    expect(source("src/screens/library/index.tsx")).toContain(
      "keyboardDismissMode={keyboardDismissMode}",
    );
  });

  it("keeps inputs clear of the keyboard without an accessory toolbar", () => {
    expect(source("src/utils/keyboard.ts")).toContain(
      "export const keyboardInputBottomOffset = 20",
    );
    for (const screen of [
      "src/screens/account/index.tsx",
      "src/screens/artwork/index.tsx",
      "src/screens/onboarding/index.tsx",
    ]) {
      expect(source(screen)).toContain(
        "bottomOffset={keyboardInputBottomOffset}",
      );
    }

    for (const file of filesUnder("src")) {
      expect(readFileSync(file, "utf8")).not.toContain("KeyboardToolbar");
    }
  });

  it("keeps the sketchpad save footer attached to the keyboard", () => {
    const sketchpadEditor = source("src/screens/sketchpad-editor/index.tsx");
    expect(sketchpadEditor).toContain("<KeyboardStickyView>");
    expect(sketchpadEditor).toContain(
      "const footerBottomPadding = Math.max(insets.bottom, 12)",
    );
    expect(sketchpadEditor).toContain(
      "bottomOffset={scrollContentBottomPadding}",
    );
  });
});
