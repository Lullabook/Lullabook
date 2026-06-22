import { Pressable, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { C, F, R } from "@/constants/theme";

/**
 * Issue 104 — Branded in-app back affordance (Maya UI).
 *
 * A pill-shaped back button rendered in the header left slot. Guarded by
 * `router.canGoBack()` — when there's nowhere to go back to, nothing renders
 * (no dead-end, no crash at the stack root). Uses Maya design tokens.
 */
export function BackPill({ label = "Back" }: { label?: string }) {
  if (!router.canGoBack()) return null;
  return (
    <Pressable
      onPress={() => router.back()}
      style={st.pill}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Text style={st.arrow}>‹</Text>
      <Text style={st.label}>{label}</Text>
    </Pressable>
  );
}

export const mayaStackHeader = {
  headerStyle: { backgroundColor: C.bg },
  headerShadowVisible: false,
  headerTintColor: C.primary,
  headerTitleStyle: { color: C.text, fontFamily: F.displayBold, fontSize: 20 },
  headerBackVisible: false,
  headerLeft: () => <BackPill />,
};

const st = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: R.pill,
    backgroundColor: C.primaryBg,
    marginLeft: 4,
  },
  arrow: { color: C.primary, fontFamily: F.displayBold, fontSize: 20, lineHeight: 22 },
  label: { color: C.primary, fontFamily: F.bodyBold, fontSize: 14 },
});
