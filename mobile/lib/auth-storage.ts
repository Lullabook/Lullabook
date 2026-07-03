import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** The minimal async key-value shape Supabase's auth-session persistence needs. */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Native (iOS) session storage — expo-secure-store's encrypted keychain. This is
 * the shipping path; R1 is iOS-only.
 */
const nativeStorage: AuthStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/**
 * Web session storage — localStorage. expo-secure-store has NO web
 * implementation: its native methods (e.g. `getValueWithKeyAsync`) are
 * undefined in the browser and throw the moment Supabase reads the session. So
 * the Expo-web dev-preview target must never touch SecureStore. Web is
 * preview-only; iOS ships the encrypted native path above.
 */
const webStorage: AuthStorage = {
  getItem: async (key) =>
    typeof localStorage !== "undefined" ? localStorage.getItem(key) : null,
  setItem: async (key, value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

/**
 * Pick the Supabase auth-session storage for the running platform. On web,
 * expo-secure-store is unavailable, so fall back to localStorage; every other
 * platform (iOS) uses the encrypted SecureStore keychain. `os` is injectable so
 * the branch is unit-testable without a device.
 */
export function selectAuthStorage(os: string = Platform.OS): AuthStorage {
  return os === "web" ? webStorage : nativeStorage;
}
