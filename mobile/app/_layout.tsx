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
import { C, F } from "@/constants/theme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

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
        <Stack.Screen name="characters/index" options={{ title: "Characters", ...stackHeader }} />
        <Stack.Screen name="characters/new" options={{ title: "New character", ...stackHeader }} />
        <Stack.Screen name="characters/[id]" options={{ title: "Edit character", ...stackHeader }} />
        <Stack.Screen name="family/new" options={{ title: "Add family", ...stackHeader }} />
        <Stack.Screen name="account" options={{ title: "Account", ...stackHeader }} />
        <Stack.Screen name="storybooks/new" options={{ title: "New story", ...stackHeader }} />
        <Stack.Screen name="storybooks/[id]" options={{ title: "Story", ...stackHeader }} />
      </Stack>
    </ThemeProvider>
  );
}

const stackHeader = {
  headerStyle: { backgroundColor: C.bg },
  headerShadowVisible: false,
  headerTintColor: C.primary,
  headerTitleStyle: { color: C.text, fontFamily: F.displayBold, fontSize: 20 },
};
