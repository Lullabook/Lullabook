import { Stack } from "expo-router";
import { BackPill } from "@/components/BackPill";
import { C, F } from "@/constants/theme";

/**
 * Issue 103 — nested stack-in-tab for Stories. The tab bar persists across
 * drill-downs (library → reader); back stays inside the tab.
 */
export default function StoriesStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Library", headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Story" }} />
    </Stack>
  );
}
