// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "supabase/functions/**"],
  },
  {
    // Reanimated shared values are intentionally mutable inside worklets and
    // gesture callbacks. React's compiler lint rules cannot model that API.
    files: ["src/components/drawing-viewer.tsx", "src/screens/home/index.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    // These components intentionally reset transient editor/modal state when
    // their route, model, or visibility identity changes. Keep this allowlist
    // narrow so new synchronous effect resets still fail lint.
    files: [
      "src/components/artwork-export-sheet.tsx",
      "src/components/pad-drawer.tsx",
      "src/components/pro-paywall.tsx",
      "src/layouts/root-layout.native.tsx",
      "src/screens/account/index.tsx",
      "src/screens/artwork/index.tsx",
      "src/screens/exports/index.tsx",
      "src/screens/home/index.tsx",
      "src/screens/library/index.tsx",
      "src/screens/onboarding/index.tsx",
      "src/screens/routes/auth-callback-route.native.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Several Jest suites configure mocks before importing the module under
    // test. Reordering those imports would change module initialization.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "import/first": "off",
    },
  },
]);
