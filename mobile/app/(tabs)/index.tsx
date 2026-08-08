import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FlatList, StyleSheet, Text, View, Pressable } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { BrandGradient, HERO_GRAD, Screen, Card, Float, Twinkle, SkeletonCard, SkeletonRow } from "@/components/maya-ui";
import { fetchHome, refreshHome, type HomeResponse } from "@/lib/api";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { C, F, R } from "@/constants/theme";
import { shouldShowInitialSkeleton } from "@/lib/render-state";

const AnimatedPressable = createAnimatedComponent(Pressable);

// Web port (src/components/v2/tokens.ts AVATAR_GRADIENTS / world.ts) — two-tone
// gradient pairs cycled across the avatar rail so every roster chip reads as
// part of the same "Maya's World" palette instead of a flat single color.
const AVATAR_GRADIENT_PAIRS: [string, string][] = [
  ["#8B6DF0", "#6A55C9"],
  ["#E79A3C", "#F6C177"],
  ["#E78AA0", "#F2A6B8"],
  ["#5FB389", "#9FD8B1"],
  ["#3f9bb0", "#7fc8c0"],
];

// Web port (src/components/v2/home-dashboard.tsx cardIconBg) — per-card icon
// gradients so the dashboard grid isn't four flat-colored squares.
const CONTINUE_GRAD: [string, string] = ["#8B6DF0", "#6A55C9"];
const JOURNAL_GRAD: [string, string] = ["#F6C177", "#E79A3C"];
const STORYBOOK_GRAD: [string, string] = ["#5FB389", "#9FD8B1"];
const FAMILY_GRAD: [string, string] = ["#E78AA0", "#F2A6B8"];

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

/** A gradient icon tile shared by the dashboard cards (web: cardIconBg map). */
function DashIcon({ colors, icon }: { colors: [string, string]; icon: string }) {
  return (
    <BrandGradient colors={colors} fallback={colors[0]} style={st.dashIcon}>
      <Text style={st.dashIconText}>{icon}</Text>
    </BrandGradient>
  );
}

/** Web port (v2-section-head / v2-section-title) — title + optional trailing link. */
function SectionHead({ title, actionLabel, onPressAction }: { title: string; actionLabel?: string; onPressAction?: () => void }) {
  return (
    <View style={st.sectionHead}>
      <Text style={st.sectionTitle}>{title}</Text>
      {actionLabel && onPressAction ? (
        <Pressable onPress={onPressAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={st.sectionLink}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface AvatarItem {
  id: string;
  name: string;
  initial: string;
  role: string;
  badge: string;
  status?: "training" | "ready" | "failed";
}

/** Web port (v2-avatar-chip) — gradient circle, name, role, status/badge corner. */
function AvatarChip({ item, index, onPress }: { item: AvatarItem; index: number; onPress: () => void }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  const grad = AVATAR_GRADIENT_PAIRS[index % AVATAR_GRADIENT_PAIRS.length]!;
  const statusColor = item.status === "ready" ? C.green : item.status === "training" ? C.accent : item.status === "failed" ? C.danger : undefined;
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} — ${item.role}`}
      style={[st.avatarChip, style]}
    >
      <View>
        <BrandGradient colors={grad} fallback={grad[0]} style={st.avatarCircle}>
          <Text style={st.avatarCircleText}>{item.initial}</Text>
        </BrandGradient>
        <View style={st.avatarBadge}>
          <Text style={st.avatarBadgeText}>{item.badge}</Text>
        </View>
        {statusColor ? <View style={[st.avatarStatusDot, { backgroundColor: statusColor }]} /> : null}
      </View>
      <Text style={st.avatarName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={st.avatarRole} numberOfLines={1}>
        {item.role}
      </Text>
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await (force ? refreshHome() : fetchHome());
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

  if (shouldShowInitialSkeleton(loading, home !== null)) {
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

  // Web port (services/world.ts getHome avatars) — baby persona first, then the
  // rest of the family roster, then a handful of not-yet-promoted characters.
  // Built from data `fetchHome` already loaded — no new endpoint.
  const personas = home?.personas ?? [];
  const babyPersonas = personas.filter((p) => p.kind === "baby");
  const adultPersonas = personas.filter((p) => p.kind !== "baby");
  const characters = home?.characters ?? [];
  const worldAvatars: AvatarItem[] = [
    ...babyPersonas.map((p) => ({
      id: p.id,
      name: p.displayName,
      initial: p.displayName.charAt(0).toUpperCase(),
      role: "Star",
      badge: "⭐",
      status: p.status,
    })),
    ...adultPersonas.map((p) => ({
      id: p.id,
      name: p.displayName,
      initial: p.displayName.charAt(0).toUpperCase(),
      role: "Family",
      badge: "💛",
      status: p.status,
    })),
    ...characters.slice(0, 4).map((c) => ({
      id: c.id,
      name: c.displayName,
      initial: c.displayName.charAt(0).toUpperCase(),
      role: "Character",
      badge: "🐻",
    })),
  ];

  return (
    <Screen onRefresh={() => load(true)} refreshing={loading}>
      {/* Hero — brand 3-stop dusk gradient (REFERENCE.md §1.3), ported from
          v2-hero: bigger floating star + twinkling background dots. */}
      <BrandGradient colors={HERO_GRAD} fallback={C.primary} style={st.hero}>
        <Twinkle>
          <View style={[st.heroTwinkle, { top: 26, left: 40, width: 6, height: 6 }]} />
        </Twinkle>
        <Twinkle>
          <View style={[st.heroTwinkle, { top: 54, right: 46, width: 5, height: 5, backgroundColor: "#FFF3D6" }]} />
        </Twinkle>
        <Twinkle>
          <View style={[st.heroTwinkle, { bottom: 64, left: 84, width: 5, height: 5 }]} />
        </Twinkle>

        <Text style={st.heroEyebrow}>✨ A growing world starring</Text>
        <Float>
          <View style={st.heroStar}>
            <Text style={st.heroStarText}>{babyInitial}</Text>
          </View>
        </Float>
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
          buried behind one Home card. Restyled to the soft cream/lavender
          nudge-card look (web: world-journal-cards.tsx cardStyle) instead of
          a flat accent fill. */}
      <DashCard
        onPress={() => router.push("/daily")}
        label={`Open ${babyName}'s Journal`}
        style={st.journalHero}
      >
        <BrandGradient colors={["#FFFDF9", "#FBEBCE"]} fallback={C.primaryBg} style={st.journalIcon}>
          <Text style={st.journalIconText}>📖</Text>
        </BrandGradient>
        <View style={{ flex: 1 }}>
          <Text style={st.journalLabel} numberOfLines={1}>
            ✨ {babyName}&apos;s Journal
          </Text>
          <Text style={st.journalSub}>Log a moment, see the timeline, make it a story →</Text>
        </View>
      </DashCard>

      {/* Dashboard cards — web port (home-dashboard.tsx DashboardCard): gradient
          icon tiles + uniform card border/shadow instead of flat icon fills. */}
      <View style={st.cardGrid}>
        <DashCard onPress={() => router.push("/stories" as never)} label="Continue reading">
          {/* Issue 166 — 🌙 (the last bedtime story) distinct from 📖 (Journal hero) */}
          <DashIcon colors={CONTINUE_GRAD} icon="🌙" />
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle} numberOfLines={1}>
              Continue reading
            </Text>
            <Text style={st.dashSub} numberOfLines={1}>
              Your last story →
            </Text>
          </View>
        </DashCard>

        <DashCard onPress={() => router.push("/daily")} label="What happened today?">
          {/* Issue 166 — ✍️ (capturing/writing) distinct from ✨ (Create tab) */}
          <DashIcon colors={JOURNAL_GRAD} icon="✍️" />
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle} numberOfLines={1}>
              What happened today?
            </Text>
            <Text style={st.dashSub} numberOfLines={1}>
              Log a moment to personalize →
            </Text>
          </View>
        </DashCard>

        <DashCard onPress={() => router.push("/stories" as never)} label="Your storybooks">
          <DashIcon colors={STORYBOOK_GRAD} icon="📚" />
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle} numberOfLines={1}>
              Your storybooks
            </Text>
            <Text style={st.dashSub} numberOfLines={1}>
              Open the library →
            </Text>
          </View>
        </DashCard>

        <DashCard onPress={() => router.push("/family")} label="Family">
          <DashIcon colors={FAMILY_GRAD} icon="💛" />
          <View style={{ flex: 1 }}>
            <Text style={st.dashTitle} numberOfLines={1}>
              Family
            </Text>
            <Text style={st.dashSub} numberOfLines={1}>
              {familyCount} {familyCount === 1 ? "person" : "people"} who love {babyName} →
            </Text>
          </View>
        </DashCard>
      </View>

      {/* "Everyone in {baby}'s world" avatar rail — web port (world/page.tsx
          v2-avatar-row), built from the personas/characters `fetchHome`
          already returns (no new endpoint). */}
      <View>
        <SectionHead title={`Everyone in ${babyName}'s world`} actionLabel="Manage family →" onPressAction={() => router.push("/family")} />
        {worldAvatars.length === 0 ? (
          <Text style={st.emptyRosterText}>Add family members and characters to fill this world.</Text>
        ) : (
          <FlatList
            horizontal
            data={worldAvatars}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.avatarRow}
            renderItem={({ item, index }) => (
              <AvatarChip item={item} index={index} onPress={() => router.push("/family")} />
            )}
          />
        )}
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
    overflow: "hidden",
    // Web port (V2_SHADOW.hero) — plum-tinted glow, never gray/black.
    shadowColor: "#6A55C9",
    shadowOpacity: 0.32,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  heroTwinkle: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  heroEyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#FFE9C9",
  },
  heroStar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "rgba(255,253,249,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#3A2850",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  heroStarText: {
    fontFamily: F.display,
    fontSize: 38,
    color: C.surface,
  },
  heroTitle: {
    fontFamily: F.display,
    fontSize: 28,
    color: C.surface,
    textAlign: "center",
  },
  heroLead: {
    fontFamily: F.body,
    fontSize: 14,
    color: "#FBEAF3",
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
    backgroundColor: C.surfaceAlt,
    borderColor: "#D4C4F0",
    borderWidth: 1,
    borderRadius: R.card,
    padding: 18,
    marginBottom: 4,
    shadowColor: "#3A2850",
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  journalIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  journalIconText: { fontSize: 24 },
  journalLabel: { fontFamily: F.displayBold, fontSize: 17, color: C.text },
  journalSub: { fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  dashCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 20,
    // Web port (V2_SHADOW.charCard) — plum-tinted, matches web card shadow.
    shadowColor: "#3A2850",
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  sectionLink: { fontFamily: F.bodyBold, fontSize: 13, color: C.primary },
  emptyRosterText: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20 },
  avatarRow: { gap: 18, paddingRight: 4 },
  avatarChip: { alignItems: "center", gap: 8, width: 76 },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: C.surface,
    shadowColor: "#3A2850",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  avatarCircleText: { fontFamily: F.displayBold, fontSize: 22, color: C.surface },
  avatarBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgeText: { fontSize: 11 },
  avatarStatusDot: {
    position: "absolute",
    top: 0,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.surface,
  },
  avatarName: { fontFamily: F.bodyBold, fontSize: 12, color: C.text, textAlign: "center" },
  avatarRole: { fontFamily: F.body, fontSize: 10, color: C.soft, textAlign: "center" },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planDot: { width: 9, height: 9, borderRadius: 5 },
  meta: { fontSize: 14, color: C.muted, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
