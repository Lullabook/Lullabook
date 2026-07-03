import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseConfig } from "@/lib/env";
import { selectAuthStorage } from "@/lib/auth-storage";

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!client) {
    const { url, key } = requireSupabaseConfig();
    client = createClient(url, key, {
      auth: {
        storage: selectAuthStorage(),
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
