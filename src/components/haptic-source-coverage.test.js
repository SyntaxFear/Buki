/* global __dirname, describe, expect, it */

const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

const SOURCE_ROOT = path.resolve(__dirname, "..");
const RAW_PRESSABLE_ALLOWED = new Set([
  "components/haptic-pressable.tsx",
  "components/native-drawing-mode-picker.tsx",
  "components/native-toolbar-button.tsx",
  "components/public-site.tsx",
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

function source(relativePath) {
  return readFileSync(path.join(SOURCE_ROOT, relativePath), "utf8");
}

describe("native pressable haptic coverage", () => {
  it("routes React Native Pressable usage through the shared haptic layer", () => {
    const rawPressableImport =
      /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from\s*["']react-native["']/s;
    const violations = sourceFiles(SOURCE_ROOT)
      .filter((file) => rawPressableImport.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SOURCE_ROOT, file))
      .filter((file) => !RAW_PRESSABLE_ALLOWED.has(file));

    expect(violations).toEqual([]);
  });

  it("keeps ordinary buttons tactile while selectors retain selection feedback", () => {
    expect(source("components/haptic-pressable.tsx")).toMatch(
      /haptic = Haptics\.ImpactFeedbackStyle\.Light/,
    );
    expect(source("components/native-toolbar-button.ios.tsx")).toMatch(
      /impactHaptic\(/,
    );
    expect(source("components/native-drawing-mode-picker.tsx")).toMatch(
      /selectionHaptic\(/,
    );
    expect(source("utils/haptics.ios.tsx")).toMatch(/scheduleOnUI\(/);
  });

  it("covers native controls that bypass the shared React Native pressable", () => {
    const nativeInteractionPaths = [
      ["components/native-capture-button.ios.tsx", /impactHaptic\(/],
      ["components/native-navigation-header.tsx", /impactHaptic\(/],
      ["screens/onboarding/index.tsx", /AppleAuthenticationButton[\s\S]*impactHaptic\(/],
      ["utils/haptics.android.tsx", /performAndroidHapticsAsync\(/],
    ];

    for (const [relativePath, expectedHaptic] of nativeInteractionPaths) {
      expect(source(relativePath)).toMatch(expectedHaptic);
    }
  });

  it("does not stack app feedback on system-native switches and pickers", () => {
    expect(source("components/native-drawing-mode-picker.ios.tsx")).not.toContain(
      "selectionHaptic",
    );
    expect(source("store/preferences.ts")).not.toContain("selectionHaptic");
    expect(source("screens/account/index.tsx")).not.toContain(
      "selectionHaptic",
    );
    expect(source("screens/sketchpad-editor/index.tsx")).not.toContain(
      "selectionHaptic",
    );
  });

  it("lets pagination use the page-turn haptic instead of double firing", () => {
    expect(source("components/page-pagination.tsx")).toMatch(
      /testID={`page-marker-\$\{pageNumber\}`}[^>]*haptic=\{false\}|haptic=\{false\}[^>]*testID={`page-marker-\$\{pageNumber\}`}/s,
    );
  });
});
