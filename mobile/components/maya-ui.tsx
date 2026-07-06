/**
 * Small Maya's World UI kit for React Native. Import these in screens so each
 * screen stays short and consistent. Pure RN primitives — no extra deps.
 *
 * Issue 136 — PrimaryButton / GhostButton / Chip use the shared
 * `usePressFeedback` hook (opacity + spring scale via reanimated + haptics).
 * Reduce-motion degrades the spring to an instant transition; haptics no-op
 * when unavailable (fail-open). Every shared pressable also gets `hitSlop`.
 */
import type { ComponentType, ReactNode } from "react";
import { useEffect } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type FlatListProps,
  type ListRenderItem,
  type SectionListProps,
  type TextInputProps,
} from "react-native";
import Animated, {
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
  FadeInUp,
  FadeIn,
  SlideInRight,
  Layout,
} from "react-native-reanimated";
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
  children?: ReactNode;
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
// Brand hero gradient (REFERENCE.md §1.3): 135deg dusk purple → plum → golden hour.
export const HERO_GRAD: [string, string, string] = ["#6A55C9", "#B5739E", "#F0A878"];
const GRAD_END = { x: 1, y: 1 };
const GRAD_START = { x: 0, y: 0 };

/**
 * Brand gradient surface with the same runtime fallback as PrimaryButton: if
 * expo-linear-gradient is unavailable, renders a solid `fallback` fill instead
 * (never a red-screen). Use for hero bands, book covers, and avatar circles so
 * screens keep the brand's gradient richness without hand-rolled fills.
 */
export function BrandGradient({
  colors,
  fallback,
  style,
  children,
}: {
  colors: string[];
  fallback?: string;
  style?: object;
  children?: ReactNode;
}) {
  if (LinearGradientImpl) {
    return (
      <LinearGradientImpl colors={colors} start={GRAD_START} end={GRAD_END} style={style}>
        {children}
      </LinearGradientImpl>
    );
  }
  return <View style={[{ backgroundColor: fallback ?? colors[0] }, style]}>{children}</View>;
}

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
      </KeyboardAvoidingView>
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

/**
 * Issue 143 — A Card with a `FadeInUp` entrance (reanimated worklet, UI thread,
 * 60fps). Reduce-motion degrades to a short crossfade. Use for the first paint
 * of content cards so screens "settle in" instead of popping.
 */
export function MotionCard({ children, style, delay = 0 }: { children: ReactNode; style?: object; delay?: number }) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion ? FadeIn.duration(120) : FadeInUp.delay(delay).duration(380).springify().damping(20);
  return (
    <Animated.View entering={entering} style={[s.card, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * Issue 143 — Twinkling hero star (brand-spec `lbTwinkle`: opacity .25↔1,
 * scale .8↔1). Reserved for the hero star / sparkles. Reduce-motion → static.
 */
export function Twinkle({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      v.value = 1;
      return;
    }
    v.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [reduceMotion]);
  const aStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.75 * v.value,
    transform: [{ scale: 0.8 + 0.2 * v.value }],
  }));
  return <Animated.View style={[aStyle]}>{children}</Animated.View>;
}

/**
 * Issue 143 — Gently floating element (brand-spec `lbFloat`: translateY
 * 0↔-6px). For book covers / hero elements. Reduce-motion → static.
 */
export function Float({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      v.value = 0;
      return;
    }
    v.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [reduceMotion]);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * v.value }],
  }));
  return <Animated.View style={[aStyle]}>{children}</Animated.View>;
}

/**
 * Issue 143 — Animated reader page-turn. `pageKey` changes → the view remounts
 * and the `SlideInRight` entering re-fires (a real page-turn instead of the
 * instant `setPageIndex` swap). Reduce-motion → short crossfade.
 *
 * R1 latency invariant: page turn completes < 100ms. Timing-based (springify
 * ignores `duration` and settles in ~400ms, which blew the budget).
 */
export function PageTurn({ pageKey, children }: { pageKey: string | number; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion ? FadeIn.duration(90) : SlideInRight.duration(90).easing(Easing.out(Easing.quad));
  return (
    <Animated.View key={pageKey} entering={entering}>
      {children}
    </Animated.View>
  );
}

/**
 * Issue 144 — Animated segmented toggle with a sliding indicator (real 44pt
 * targets). The indicator slides between segments via a measured-width shared
 * value; reduce-motion degrades to instant. Replaces the static billing toggle.
 */
export function AnimatedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const move = () => {
    const seg = width.value / Math.max(1, options.length);
    x.value = reduceMotion ? seg * idx : withSpring(seg * idx, { damping: 20, stiffness: 320 });
  };
  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    width.value = e.nativeEvent.layout.width;
    move();
  };
  useEffect(() => {
    move();
  });
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: width.value / Math.max(1, options.length),
  }));
  return (
    <View onLayout={onLayout} style={s.toggleWrap}>
      <Animated.View style={[s.toggleIndicator, indicatorStyle]} />
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={s.toggleBtn}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[s.toggleText, active && { color: C.surface }]} allowFontScaling>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Issue 144 — Animated consent checkbox (spring check, 44pt target). The ✓
 * springs in when checked; reduce-motion degrades to instant.
 */
export function AnimatedCheckbox({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  const v = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    v.value = reduceMotion ? (checked ? 1 : 0) : withSpring(checked ? 1 : 0, { damping: 16, stiffness: 320 });
  }, [checked, reduceMotion]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: v.value }], opacity: v.value }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={HIT_SLOP}
      style={[s.consentRow, style]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[s.checkbox, { backgroundColor: checked ? C.primary : C.surface, borderColor: checked ? C.primary : C.borderDashed }]}>
        <Animated.Text style={[s.checkmark, checkStyle]}>✓</Animated.Text>
      </View>
      <Text style={s.consentText} allowFontScaling>
        {label}
      </Text>
    </AnimatedPressable>
  );
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
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
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

export function GhostButton({
  title,
  onPress,
  danger,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[s.btn, s.btnGhost, danger && { borderColor: C.dangerBorder }, disabled && { opacity: 0.45 }, style]}
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
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
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

/**
 * Issue 139 — Reusable shimmer skeleton. Pulses opacity 0.45↔0.85 on the UI
 * thread (reanimated worklet, 60fps); reduce-motion degrades to a static fill.
 * Renders immediately on mount (no blank/`ActivityIndicator` flash).
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: object;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(withTiming(0.85, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reduceMotion]);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: C.borderSoft }, aStyle, style] as object}
    />
  );
}

/** A card-shaped skeleton mirroring the final `Card` layout. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={s.card}>
      <Skeleton width="60%" height={20} />
      <View style={{ gap: 10, marginTop: 4 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} height={14} radius={7} width={i === lines - 1 ? "70%" : "100%"} />
        ))}
      </View>
    </View>
  );
}

/** A list-row skeleton mirroring a roster/library row (avatar + two lines). */
export function SkeletonRow() {
  return (
    <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }]}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="35%" height={12} radius={6} />
      </View>
    </View>
  );
}

/**
 * Issue 139 — Illustrated empty state (large emoji + title + optional CTA),
 * replacing one-line gray text. Actionable, not a dead-end.
 */
export function EmptyState({
  emoji,
  title,
  hint,
  cta,
  onCta,
}: {
  emoji: string;
  title: string;
  hint?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <Card style={s.emptyState}>
      <Text style={s.emptyEmoji}>{emoji}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
      {cta && onCta ? <PrimaryButton title={cta} onPress={onCta} /> : null}
    </Card>
  );
}

/**
 * Issue 142 — Inset separator for native list spacing (a hairline divider
 * indented to sit under content, not edge-to-edge).
 */
export function InsetSeparator({ indent = 58 }: { indent?: number }) {
  return (
    <View style={[s.insetSepWrap, { paddingLeft: indent }]}>
      <View style={s.insetSep} />
    </View>
  );
}

/** Wrap a ReactNode into a component for FlatList/SectionList List* props. */
function asListComponent(node: ReactNode): ComponentType<unknown> | undefined {
  if (node == null) return undefined;
  const Component = () => <>{node}</>;
  return Component;
}

/**
 * Issue 142 — A FlatList-rooted screen so list rows recycle smoothly (no
 * `.map()`-in-ScrollView). The chrome (eyebrow/lead/cards) goes in
 * `ListHeaderComponent`; the empty state in `ListEmptyComponent`. Pull-to-
 * refresh and keyboard handling are inherited. Mirrors `Screen`'s padding.
 */
export function ListScreen<T>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  ItemSeparatorComponent,
  onRefresh,
  refreshing = false,
}: {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T) => string;
  ListHeaderComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ItemSeparatorComponent?: FlatListProps<T>["ItemSeparatorComponent"];
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={asListComponent(ListHeaderComponent)}
          ListEmptyComponent={asListComponent(ListEmptyComponent)}
          ListFooterComponent={asListComponent(ListFooterComponent)}
          ItemSeparatorComponent={ItemSeparatorComponent}
          contentContainerStyle={s.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} titleColor={C.muted} />
            ) : undefined
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Issue 142 — A SectionList-rooted screen (for screens with grouped sections). */
export function SectionListScreen<T, S extends { title: string; data: T[] }>({
  sections,
  renderItem,
  keyExtractor,
  renderSectionHeader,
  ListHeaderComponent,
  ListFooterComponent,
  ItemSeparatorComponent,
  onRefresh,
  refreshing = false,
}: {
  sections: S[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T) => string;
  renderSectionHeader?: (info: { section: S }) => ReactNode;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ItemSeparatorComponent?: SectionListProps<S>["ItemSeparatorComponent"];
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <SectionList
        sections={sections}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        renderSectionHeader={renderSectionHeader ? (info: { section: S }) => <>{renderSectionHeader(info)}</> : undefined}
        ListHeaderComponent={asListComponent(ListHeaderComponent)}
        ListFooterComponent={asListComponent(ListFooterComponent)}
        ItemSeparatorComponent={ItemSeparatorComponent}
        contentContainerStyle={s.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} titleColor={C.muted} />
          ) : undefined
        }
      />
    </SafeAreaView>
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
  btnDisabledFill: { backgroundColor: C.border },
  btnGhost: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  btnText: { fontFamily: F.bodyBold, fontSize: 15 },
  chip: { minHeight: 44, borderRadius: R.chip, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16, justifyContent: "center" },
  chipText: { fontFamily: F.bodyBold, fontSize: 14 },
  emptyState: { alignItems: "center", gap: 12, paddingVertical: 30 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontFamily: F.display, fontSize: 20, color: C.text, textAlign: "center" },
  emptyHint: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: "center", lineHeight: 20 },
  insetSepWrap: { height: 13, justifyContent: "center" },
  insetSep: { height: 1, backgroundColor: C.borderSoft },
  toggleWrap: {
    flexDirection: "row",
    backgroundColor: C.surfaceAlt,
    borderRadius: R.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
    alignSelf: "flex-start",
    position: "relative",
  },
  toggleIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: C.primary,
    borderRadius: R.pill,
  },
  // Issue 167 — flex:1 so segments share space equally regardless of label
  // length (no clipping of "Annual (save 17%)"). textAlign center balances
  // the label within its segment.
  toggleBtn: { flex: 1, minHeight: 44, paddingHorizontal: 22, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  toggleText: { fontFamily: F.bodyBold, fontSize: 14, color: C.muted, textAlign: "center" },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 6 },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkmark: { color: C.surface, fontFamily: F.bodyBold, fontSize: 18 },
  consentText: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21 },
});
