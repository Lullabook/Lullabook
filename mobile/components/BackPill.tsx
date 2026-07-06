import { Pressable, Text, StyleSheet } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { C, F, R } from "@/constants/theme";
import { usePressFeedback } from "@/lib/use-press-feedback";

const AnimatedPressable = createAnimatedComponent(Pressable);

/**
 * Issue 104 — Branded in-app back affordance (Maya UI).
 *
 * A pill-shaped back button rendered in the header left slot. Guarded by
 * `router.canGoBack()` — when there's nowhere to go back to, nothing renders
 * (no dead-end, no crash at the stack root). Uses Maya design tokens.
 *
 * Issue 136 — wired to the shared press-feedback hook (opacity + spring +
 * haptics) so it inherits polish for free.
 */
export function BackPill({ label = "Back" }: { label?: string }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  if (!router.canGoBack()) return null;
  return (
    <AnimatedPressable
      onPress={() => router.back()}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
      style={[st.pill, style]}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Text style={st.arrow}>‹</Text>
      <Text style={st.label}>{label}</Text>
    </AnimatedPressable>
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
  // Issue 166 — plum-tinted shadow from the Maya design system canon
  // (shadowColor #3A2850, same family as Card). Elevates the back control
  // from "flat" to "part of the system" without overpowering the content.
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    backgroundColor: C.primaryBg,
    marginLeft: 4,
    shadowColor: "#3A2850",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  arrow: { color: C.primary, fontFamily: F.displayBold, fontSize: 20, lineHeight: 22 },
  label: { color: C.primary, fontFamily: F.bodyBold, fontSize: 14 },
});
