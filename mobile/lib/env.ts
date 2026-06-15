import Constants from "expo-constants";

type MobileExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  apiUrl?: string;
};

function extra(): MobileExtra {
  return (Constants.expoConfig?.extra ?? {}) as MobileExtra;
}

export function getSupabaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    extra().supabaseUrl ??
    ""
  );
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    extra().supabaseAnonKey ??
    ""
  );
}

export function getApiUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? extra().apiUrl ?? "http://localhost:3000";
}

export function requireSupabaseConfig(): { url: string; key: string } {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy mobile/.env.example to mobile/.env, or add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the repo root .env.local, then restart Expo with: npx expo start -c"
    );
  }
  return { url, key };
}
