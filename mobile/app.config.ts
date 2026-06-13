import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Lullabook",
  slug: "lullabook",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "com.lullabook",
  userInterfaceStyle: "automatic",
  ios: {
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
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#FFF8F0",
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: "YOUR_EAS_PROJECT_ID" },
  },
};

export default config;
