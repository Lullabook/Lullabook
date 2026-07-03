import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { BrandGradient, HERO_GRAD, Screen, Card, SkeletonCard, SkeletonRow, Twinkle } from "@/components/maya-ui";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { C, F, R } from "@/constants/theme";

const AnimatedPressable = createAnimatedComponent(Pressable);

/** A dashboard card row with the shared press feedback + a11y role. */
function DashCard({
  onPress,
  label,
  style,
  children,
}: {
  onPress: () => void;
  label: string;
  style?: object;
  children: ReactNode;
}) {
  const { style: pressStyle, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.dashCard, style, pressStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHome();
      setHome(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load";
      if (message.includes("Unauthorized") || message.includes("Missing bearer")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <SkeletonCard />
        <SkeletonRow />
        <SkeletonCard lines={2} />
      </Screen>
    );
  }

  const babyName = home?.selectedBaby?.displayName ?? "Your baby";
  const babyInitial = babyName.charAt(0).toUpperCase();
  const familyCount = home?.personas?.length ?? 0;

  return (
    <Screen onRefresh={load} refreshing={loading}>
      {/* Hero — brand 3-stop dusk gradient (REFERENCE.md §1.3) */}
      <BrandGradient colors={HERO_GRAD} fallback={C.primary} style={st.hero}>
        <Text style={st.heroEyebrow}>✨ A growing world starring</Text>
        <View style={st.heroStar}>
          <Twinkle>
            <Text style={st.heroStarText}>{babyInitial}</Text>
          </Twinkle>
        </View>
        <Text style={st.heroTitle}>{babyName}&apos;s World</Text>
        <Text style={st.heroLead}>
          A whole world of stories starring {babyName} — and everyone who loves them.
        </Text>
        <Pressable
          style={({ pressed }) => [st.heroCta, pressed && { opacity: 0.85 }]}
          onPress={() => router.push("/create" as never)}
          accessibilityRole="button"
          accessibilityLabel="Start a new story"
        >
          <Text style={st.heroCtaText}>✨ Start a new story</Text>
        </Pressable>
      </BrandGradient>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {/* Issue 106: Daily-life / Journal as a first-class destination — a
          prominent full-width featured card above the dashboard grid, not
          buried behind one Home card. */}
      <DashCard
        onPress={() => router.push("/daily")}
        label={`Open ${babyName}'s Journal`}
        style={st.journalHero}
      >
        <View style={st.journalIcon}>
          <Text style={st.journalIconText}>📖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.journalLabel}>✨ {babyName}&apos;s Journal</Text>
          <Text style={st.journalSub}>Log a moment, see the timeline, make it a story →</Text>
        </View>
      </DashCard>

      {/* Dashboard cards */}
      <View style={st.cardGrid}>
        <DashCard onPress={() => router.push("/stories" as never)} label="Continue reading">
          <View style={[st.dashIcon, { backgroundColor: C.primary }]}>
            <Text style={st.dashIconText}>📖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>Continue reading</Text>
            <Text style={st.dashSub}>Your last story →</Text>
          </View>
        </DashCard>

        <DashCard
          onPress={() => router.push("/daily")}
          label="What happened today?"
          style={{ borderColor: C.accentLight }}
        >
          <View style={[st.dashIcon, { backgroundColor: C.accent }]}>
            <Text style={st.dashIconText}>✨</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>What happened today?</Text>
            <Text style={st.dashSub}>Log a moment to personalize →</Text>
          </View>
        </DashCard>

        <DashCard onPress={() => router.push("/stories" as never)} label="Your storybooks">
          <View style={[st.dashIcon, { backgroundColor: C.green }]}>
            <Text style={st.dashIconText}>📚</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>Your storybooks</Text>
            <Text style={st.dashSub}>Open the library →</Text>
          </View>
        </DashCard>

        <DashCard onPress={() => router.push("/family")} label="Family">
          <View style={[st.dashIcon, { backgroundColor: C.rose }]}>
            <Text style={st.dashIconText}>💛</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>Family</Text>
            <Text style={st.dashSub}>
              {familyCount} {familyCount === 1 ? "person" : "people"} who love {babyName} →
            </Text>
          </View>
        </DashCard>
      </View>

      {/* R1 has no free tier — the plan row says plan-active or trial-available,
          never "Free tier" (ADR-0025 / R1 scope). */}
      <View style={st.planRow}>
        <View style={[st.planDot, { backgroundColor: home?.subscriptionActive ? C.green : C.accent }]} />
        <Text style={st.meta}>
          {home?.subscriptionActive ? "Your plan is active" : "7-day free trial available"}
        </Text>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  hero: {
    backgroundColor: C.primary,
    borderRadius: R.detail,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  heroEyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: C.accentLight,
  },
  heroStar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,253,249,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  heroStarText: {
    fontFamily: F.display,
    fontSize: 30,
    color: C.surface,
  },
  heroTitle: {
    fontFamily: F.display,
    fontSize: 26,
    color: C.surface,
    textAlign: "center",
  },
  heroLead: {
    fontFamily: F.body,
    fontSize: 14,
    color: "rgba(255,253,249,0.8)",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  heroCta: {
    marginTop: 12,
    backgroundColor: C.surface,
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: R.pill,
  },
  heroCtaText: {
    fontFamily: F.bodyBold,
    fontSize: 15,
    color: C.primary,
  },
  cardGrid: { gap: 12 },
  journalHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.accent,
    borderWidth: 0,
    borderRadius: R.card,
    padding: 18,
    marginBottom: 4,
  },
  journalIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,253,249,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  journalIconText: { fontSize: 24 },
  journalLabel: { fontFamily: F.displayBold, fontSize: 17, color: C.surface },
  journalSub: { fontFamily: F.body, fontSize: 13, color: "rgba(255,253,249,0.85)", marginTop: 2, lineHeight: 18 },
  dashCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 16,
  },
  dashIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dashIconText: { fontSize: 20 },
  dashTitle: { fontFamily: F.displayBold, fontSize: 16, color: C.text },
  dashSub: { fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 2 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planDot: { width: 9, height: 9, borderRadius: 5 },
  meta: { fontSize: 14, color: C.muted, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
