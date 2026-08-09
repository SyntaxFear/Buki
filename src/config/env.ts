export interface PublicAppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  revenueCatIosApiKey: string;
  privacyUrl: string;
  termsUrl: string;
  supportUrl: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required Buki configuration: ${name}`);
  return value;
}

let cached: PublicAppConfig | null = null;

export function getPublicAppConfig(): PublicAppConfig {
  if (cached) return cached;
  cached = {
    supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: required(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    ),
    revenueCatIosApiKey: required(
      "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    ),
    privacyUrl: required("EXPO_PUBLIC_PRIVACY_URL", process.env.EXPO_PUBLIC_PRIVACY_URL),
    termsUrl: required("EXPO_PUBLIC_TERMS_URL", process.env.EXPO_PUBLIC_TERMS_URL),
    supportUrl: required("EXPO_PUBLIC_SUPPORT_URL", process.env.EXPO_PUBLIC_SUPPORT_URL),
  };
  return cached;
}
