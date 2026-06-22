import { Stack } from "expo-router";
import { BackPill } from "@/components/BackPill";
import { C, F } from "@/constants/theme";

/**
 * Issue 103 — nested stack-in-tab for Settings. The tab bar persists; the
 * account screen lives inside the tab, not as a root-stack sibling.
 */
export default function SettingsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTintColor: C.primary,
        headerTitleStyle: { color: C.text, fontFamily: F.displayBold, fontSize: 20 },
        headerBackVisible: false,
        headerLeft: () => <BackPill />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Settings", headerShown: false }} />
    </Stack>
  );
}
