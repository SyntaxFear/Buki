import "react-native-url-polyfill/auto";

import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicAppConfig } from "@/config/env";
import { secureSessionStorage } from "./secure-storage";
import { installSupabaseWebCrypto } from "./web-crypto";

installSupabaseWebCrypto();

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const config = getPublicAppConfig();
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      lock: processLock,
    },
  });
  return client;
}
