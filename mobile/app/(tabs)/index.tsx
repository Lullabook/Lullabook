import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Screen, Card, PrimaryButton } from "@/components/maya-ui";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { C, F, R } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

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
      <View style={st.center} accessibilityLabel="Loading home">
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const babyName = home?.selectedBaby?.displayName ?? "Your baby";
  const babyInitial = babyName.charAt(0).toUpperCase();
  const storyCount = home?.personas?.length ?? 0;

  return (
    <Screen>
      {/* Hero */}
      <View style={st.hero}>
        <Text style={st.heroEyebrow}>✨ A growing world starring</Text>
        <View style={st.heroStar}>
          <Text style={st.heroStarText}>{babyInitial}</Text>
        </View>
        <Text style={st.heroTitle}>{babyName}&apos;s World</Text>
        <Text style={st.heroLead}>
          A whole world of stories starring {babyName} — and everyone who loves them.
        </Text>
        <Pressable style={st.heroCta} onPress={() => router.push("/create" as never)}>
          <Text style={st.heroCtaText}>✨ Start a new story</Text>
        </Pressable>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {/* Issue 106: Daily-life / Journal as a first-class destination — a
          prominent full-width featured card above the dashboard grid, not
          buried behind one Home card. */}
      <Pressable
        style={st.journalHero}
        onPress={() => router.push("/daily")}
        accessibilityRole="button"
        accessibilityLabel="Open Maya's Journal"
      >
        <View style={st.journalIcon}>
          <Text style={st.journalIconText}>📖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.journalLabel}>✨ {babyName}&apos;s Journal</Text>
          <Text style={st.journalSub}>Log a moment, see the timeline, make it a story →</Text>
        </View>
      </Pressable>

      {/* Dashboard cards */}
      <View style={st.cardGrid}>
        {/* Continue reading */}
        <Pressable
          style={st.dashCard}
          onPress={() => router.push("/stories" as never)}
          accessibilityRole="button"
          accessibilityLabel="Continue reading"
        >
          <View style={[st.dashIcon, { backgroundColor: C.primary }]}>
            <Text style={st.dashIconText}>📖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>Continue reading</Text>
            <Text style={st.dashSub}>Your last story →</Text>
          </View>
        </Pressable>

        {/* Story nudge */}
        <Pressable
          style={[st.dashCard, { borderColor: C.accentLight }]}
          onPress={() => router.push("/daily")}
          accessibilityRole="button"
          accessibilityLabel="Story nudge"
        >
          <View style={[st.dashIcon, { backgroundColor: C.accent }]}>
            <Text style={st.dashIconText}>✨</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>What happened today?</Text>
            <Text style={st.dashSub}>Log a moment to personalize →</Text>
          </View>
        </Pressable>

        {/* This week */}
        <Pressable
          style={st.dashCard}
          onPress={() => router.push("/stories" as never)}
          accessibilityRole="button"
          accessibilityLabel="This week"
        >
          <View style={[st.dashIcon, { backgroundColor: C.green }]}>
            <Text style={st.dashIconText}>📊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>This week</Text>
            <Text style={st.dashSub}>{storyCount} {storyCount === 1 ? "story" : "stories"} this week</Text>
          </View>
        </Pressable>

        {/* Family activity */}
        <Pressable
          style={st.dashCard}
          onPress={() => router.push("/family")}
          accessibilityRole="button"
          accessibilityLabel="Family activity"
        >
          <View style={[st.dashIcon, { backgroundColor: C.rose }]}>
            <Text style={st.dashIconText}>💛</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle}>Family</Text>
            <Text style={st.dashSub}>
              {home?.personas?.length ?? 0} family members →
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={st.planRow}>
        <View style={[st.planDot, { backgroundColor: home?.subscriptionActive ? C.green : C.accent }]} />
        <Text style={st.meta}>
          {home?.subscriptionActive ? "Subscribed" : "Free tier"}
        </Text>
      </View>

      <PrimaryButton title="↻ Refresh" onPress={load} />
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
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  heroStarText: {
    fontFamily: F.display,
    fontSize: 30,
    color: "#FFFDF9",
  },
  heroTitle: {
    fontFamily: F.display,
    fontSize: 26,
    color: "#FFFDF9",
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
    backgroundColor: "#FFFDF9",
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
  journalLabel: { fontFamily: F.displayBold, fontSize: 17, color: "#FFFDF9" },
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
