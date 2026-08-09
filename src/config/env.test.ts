const values = {
  EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-test-value",
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test_value",
  EXPO_PUBLIC_PRIVACY_URL: "https://example.com/privacy",
  EXPO_PUBLIC_TERMS_URL: "https://example.com/terms",
  EXPO_PUBLIC_SUPPORT_URL: "https://example.com/support",
} as const;

describe("public Expo configuration", () => {
  beforeEach(() => {
    jest.resetModules();
    for (const [name, value] of Object.entries(values)) process.env[name] = value;
  });

  afterEach(() => {
    for (const name of Object.keys(values)) delete process.env[name];
  });

  it("loads every mobile-safe value", () => {
    const { getPublicAppConfig } = require("./env") as typeof import("./env");
    expect(getPublicAppConfig()).toEqual({
      supabaseUrl: values.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: values.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      revenueCatIosApiKey: values.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      privacyUrl: values.EXPO_PUBLIC_PRIVACY_URL,
      termsUrl: values.EXPO_PUBLIC_TERMS_URL,
      supportUrl: values.EXPO_PUBLIC_SUPPORT_URL,
    });
  });

  it("fails fast when required release configuration is missing", () => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    const { getPublicAppConfig } = require("./env") as typeof import("./env");
    expect(() => getPublicAppConfig()).toThrow("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY");
  });

  it("uses Expo-compatible static environment references", () => {
    const { readFileSync } = require("fs") as {
      readFileSync: (path: string, encoding: string) => string;
    };
    const source = readFileSync(`${process.cwd()}/src/config/env.ts`, "utf8");
    expect(source).not.toContain("process.env[");
    for (const name of Object.keys(values)) {
      expect(source).toContain(`process.env.${name}`);
    }
    expect(source).not.toContain("REVENUECAT_SECRET");
  });
});
