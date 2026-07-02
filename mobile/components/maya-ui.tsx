/**
 * Small Maya's World UI kit for React Native. Import these in screens so each
 * screen stays short and consistent. Pure RN primitives — no extra deps.
 *
 * Issue 136 — PrimaryButton / GhostButton / Chip use the shared
 * `usePressFeedback` hook (opacity + spring scale via reanimated + haptics).
 * Reduce-motion degrades the spring to an instant transition; haptics no-op
 * when unavailable (fail-open). Every shared pressable also gets `hitSlop`.
 */
import type { ReactNode } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, F, R } from "@/constants/theme";
import { usePressFeedback } from "@/lib/use-press-feedback";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
// Reanimated v4's Animated namespace doesn't ship a Pressable wrapper; create
// it once at module scope (never per render).
const AnimatedPressable = createAnimatedComponent(Pressable);

/**
 * Issue 137 — expo-linear-gradient, resolved with a **runtime fallback** so a
 * missing native module never red-screens the app (the expo-av lesson). Metro's
 * `require` throws synchronously when the native module is absent; the try/catch
 * collapses to `null` and PrimaryButton renders the flat token fill instead.
 */
let LinearGradientImpl: React.ComponentType<{
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: object;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("expo-linear-gradient");
  LinearGradientImpl = mod.LinearGradient;
} catch {
  LinearGradientImpl = null;
}

// Brand-spec CTA gradients + colored glows (REFERENCE.md §1.3 / §1.5).
// ctaPurple: 135deg #8B6DF0 → #6A55C9 ; ctaAmber: 135deg #F6C177 → #E79A3C
const PURPLE_GRAD: [string, string] = ["#8B6DF0", "#6A55C9"];
const AMBER_GRAD: [string, string] = ["#F6C177", "#E79A3C"];
const GRAD_END = { x: 1, y: 1 };
const GRAD_START = { x: 0, y: 0 };

/**
 * Issue 138 — `Screen` accepts optional pull-to-refresh props. When `onRefresh`
 * is provided, a brand-colored `RefreshControl` is attached so every list
 * screen (home/stories/family/daily) inherits pull-to-refresh and the literal
 * `↻ Refresh` button is retired. Spinner appears within one frame (PRD v15).
 */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[C.primary]}
              tintColor={C.primary}
              titleColor={C.muted}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <Text style={s.pageTitle}>{children}</Text>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <Text style={s.lead}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Field({ label, ...props }: { label?: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput placeholderTextColor="#B7A992" style={s.input} {...props} />
    </View>
  );
}

/**
 * Issue 137 — PrimaryButton renders the brand-spec **135° gradient + colored
 * glow** (the single biggest "feels cheap vs premium" fix the port dropped),
 * with an **amber secondary** variant. Falls back to the flat token fill if
 * `expo-linear-gradient` is unavailable at runtime (no red-screen).
 */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "amber";
}) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "impact", style: "Light" });
  const isAmber = variant === "amber";
  const glow = isAmber ? s.btnGlowAmber : s.btnGlowPurple;
  const fallbackFill = isAmber ? s.btnPrimaryAmberFallback : s.btnPrimary;
  const textColor = disabled ? C.soft : isAmber ? C.accentDark : C.surface;
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      style={[s.btn, disabled ? null : glow, style]}
    >
      {disabled ? (
        <View style={[StyleSheet.absoluteFill, s.btnDisabledFill]} />
      ) : LinearGradientImpl ? (
        <LinearGradientImpl
          colors={isAmber ? AMBER_GRAD : PURPLE_GRAD}
          start={GRAD_START}
          end={GRAD_END}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, fallbackFill]} />
      )}
      <Text style={[s.btnText, { color: textColor }]}>{title}</Text>
    </AnimatedPressable>
  );
}

export function GhostButton({ title, onPress, danger }: { title: string; onPress?: () => void; danger?: boolean }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={HIT_SLOP}
      style={[s.btn, s.btnGhost, danger && { borderColor: C.dangerBorder }, style]}
    >
      <Text style={[s.btnText, { color: danger ? C.danger : C.primary }]}>{title}</Text>
    </AnimatedPressable>
  );
}

export function Chip({ label, icon, active, onPress }: { label: string; icon?: string; active?: boolean; onPress?: () => void }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={HIT_SLOP}
      style={[s.chip, { borderColor: active ? C.primaryLight : C.border, backgroundColor: active ? C.primaryBg : C.surface }, style]}
    >
      <Text style={[s.chipText, { color: active ? C.primary : C.muted }]}>{icon ? `${icon}  ` : ""}{label}</Text>
    </AnimatedPressable>
  );
}

export function Avatar({ initial, size = 50, color = C.primaryLight }: { initial: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: C.surface, fontFamily: F.displayBold, fontSize: size * 0.42 }}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, backgroundColor: C.bg },
  screen: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 112, gap: 22 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 1.6, fontSize: 11, fontFamily: F.bodyBold, color: C.primaryLight, marginBottom: 4 },
  pageTitle: { fontSize: 32, fontFamily: F.display, color: C.text, letterSpacing: -0.5, lineHeight: 38 },
  lead: { fontSize: 16, lineHeight: 24, color: C.muted, marginTop: 6, fontFamily: F.body },
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 22,
    gap: 14,
    shadowColor: "#3A2850",
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  label: { fontFamily: F.displayBold, fontSize: 16, color: C.text },
  input: { width: "100%", fontSize: 16, color: C.text, backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: R.input, padding: 13, fontFamily: F.body },
  btn: { minHeight: 48, borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  // Issue 137 — colored glows per the brand spec (purple + amber).
  btnGlowPurple: {
    shadowColor: "#6A55C9",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  btnGlowAmber: {
    shadowColor: "#E79A3C",
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  // Flat fallbacks when expo-linear-gradient is unavailable at runtime.
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryAmberFallback: { backgroundColor: C.accent },
  btnDisabledFill: { backgroundColor: "#E7DCCB" },
  btnGhost: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  btnText: { fontFamily: F.bodyBold, fontSize: 15 },
  chip: { minHeight: 44, borderRadius: R.chip, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16, justifyContent: "center" },
  chipText: { fontFamily: F.bodyBold, fontSize: 14 },
});
