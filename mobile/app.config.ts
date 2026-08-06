/// <reference types="node" />
import type { ExpoConfig } from "expo/config";
import fs from "fs";
import path from "path";

function applyEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const mobileDir = __dirname;
applyEnvFile(path.join(mobileDir, ".env"));
applyEnvFile(path.join(mobileDir, "../.env.local"));

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

if (supabaseUrl && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = supabaseUrl;
}
if (supabaseAnonKey && !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;
}
if (!process.env.EXPO_PUBLIC_API_URL) {
  process.env.EXPO_PUBLIC_API_URL = apiUrl;
}

// Issue 206 — free Apple ID personal teams cannot sign builds that declare
// com.apple.developer.applesignin or com.apple.developer.associated-domains.
// Only the exact string "1" enables the free-team branch; every other value
// (unset, "true", "0") is the production configuration. Never set this flag
// for a production or TestFlight build.
const freeTeam = process.env.LULLABOOK_FREE_TEAM === "1";

const plugins: ExpoConfig["plugins"] = [
  "expo-router",
  "expo-secure-store",
  ...(freeTeam ? [] : ["expo-apple-authentication"]),
  [
    "expo-splash-screen",
    {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#FBF4E7",
    },
  ],
];

// Keep the production object shape untouched so the unset config stays
// byte-for-byte identical to the pre-flag config.
const iosConfig: ExpoConfig["ios"] = freeTeam
  ? {
      supportsTablet: true,
      bundleIdentifier: "com.lullabook.app",
      buildNumber: "1",
      infoPlist: {
        NSCameraUsageDescription:
          "Lullabook uses the camera so guardians can photograph family members to create illustrated Storybooks starring their child.",
        NSPhotoLibraryUsageDescription:
          "Lullabook accesses your photo library so guardians can choose reference photos for Persona creation.",
        NSPhotoLibraryAddUsageDescription:
          "Lullabook saves exported Storybook PDFs to your photo library when you choose to keep a copy.",
      },
    }
  : {
      supportsTablet: true,
      bundleIdentifier: "com.lullabook.app",
      buildNumber: "1",
      associatedDomains: ["applinks:lullabook.app"],
      infoPlist: {
        NSCameraUsageDescription:
          "Lullabook uses the camera so guardians can photograph family members to create illustrated Storybooks starring their child.",
        NSPhotoLibraryUsageDescription:
          "Lullabook accesses your photo library so guardians can choose reference photos for Persona creation.",
        NSPhotoLibraryAddUsageDescription:
          "Lullabook saves exported Storybook PDFs to your photo library when you choose to keep a copy.",
      },
    };

const config: ExpoConfig = {
  name: "Lullabook",
  slug: "lullabook",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "com.lullabook",
  userInterfaceStyle: "light",
  ios: iosConfig,
  plugins,
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: "YOUR_EAS_PROJECT_ID" },
    supabaseUrl,
    supabaseAnonKey,
    apiUrl,
  },
};

export default config;
