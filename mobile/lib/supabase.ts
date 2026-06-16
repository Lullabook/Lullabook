import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

import { requireSupabaseConfig } from "@/lib/env";

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!client) {
    const { url, key } = requireSupabaseConfig();
    client = createClient(url, key, {
      auth: {
        storage: SecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Lazy Supabase client — avoids crashing route modules at import time. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getClient().auth.getSession();
  return data.session?.access_token ?? null;
}
