import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import {
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
} from "@expo-google-fonts/baloo-2";
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";

import { useColorScheme } from "@/components/useColorScheme";
import { BackPill } from "@/components/BackPill";
import { C, F } from "@/constants/theme";
import { initMobileSentry } from "@/lib/sentry-init";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

// Issue 151 — Sentry crash capture (fail-open; no DSN in test/dev → no-op).
initMobileSentry();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in", ...stackHeader }} />
        <Stack.Screen name="sign-up" options={{ title: "Sign up", ...stackHeader }} />
        <Stack.Screen name="daily" options={{ title: "Daily life", ...stackHeader }} />
        <Stack.Screen name="characters/index" options={{ title: "Made-up friends", ...stackHeader }} />
        <Stack.Screen name="characters/new" options={{ title: "New character", ...stackHeader }} />
        <Stack.Screen name="characters/[id]" options={{ title: "Edit character", ...stackHeader }} />
        <Stack.Screen name="family/new" options={{ title: "Add someone who loves them", ...stackHeader }} />
        {/* Issue 105: billing is a reachable, dismissible modal. */}
        <Stack.Screen
          name="billing"
          options={{ title: "Choose your plan", presentation: "modal", ...stackHeader }}
        />
      </Stack>
    </ThemeProvider>
  );
}

const stackHeader = {
  headerStyle: { backgroundColor: C.bg },
  headerShadowVisible: false,
  headerTintColor: C.primary,
  headerTitleStyle: { color: C.text, fontFamily: F.displayBold, fontSize: 20 },
  // Issue 141 — native large titles rendered in Baloo 2 (keep the storybook
  // type, gain native large-title scroll behavior). The large title now covers
  // the screen title, so the in-content PageTitle is dropped on stack screens
  // to resolve the duplicate-title problem.
  headerLargeTitle: true,
  headerLargeTitleStyle: { color: C.text, fontFamily: F.display, fontSize: 34, letterSpacing: -0.5 },
  headerLargeTitleShadowVisible: false,
  headerBackVisible: false,
  headerLeft: () => <BackPill />,
};
