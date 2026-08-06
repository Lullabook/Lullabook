import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { SectionListScreen, Screen, Eyebrow, PageTitle, Lead, Card, SkeletonRow, MotionCard } from "@/components/maya-ui";
import { RosterAvatar } from "@/components/roster-avatar";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { fetchHome, refreshHome, seedDemo, type HomeResponse } from "@/lib/api";
import { C, F, R } from "@/constants/theme";
import type { Character, Persona, PersonaStatus } from "@domain/types";
import { shouldShowInitialSkeleton } from "@/lib/render-state";

const AnimatedPressable = createAnimatedComponent(Pressable);

/** Parent-facing likeness-training labels — raw enums never reach the screen. */
const STATUS_LABEL: Record<PersonaStatus, string> = {
  training: "✨ Learning their look…",
  review: "👀 Reviewing their likeness",
  ready: "Ready to star",
  failed: "Training needs a retry",
};

/** Status dot colors mirror the web roster row's status indicator (v2-theme's familyMemberStatus). */
const STATUS_DOT: Record<PersonaStatus, string> = {
  training: C.accent,
  review: C.accent,
  ready: C.green,
  failed: C.soft,
};

type FamilyListItem =
  | { kind: "persona"; value: Persona }
  | { kind: "character"; value: Character }
  | { kind: "empty"; label: string }
  | { kind: "add-persona"; label: string }
  | { kind: "add-character"; label: string };

type FamilySection = {
  key: "personas" | "characters";
  title: string;
  emoji: string;
  count: number;
  data: FamilyListItem[];
};

/** Pill add-button with the shared press feedback + a11y (44pt target). */
function AddPill({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[st.addBtn, disabled && { opacity: 0.5 }, style]}
    >
      <Text style={st.addBtnText}>{title}</Text>
    </AnimatedPressable>
  );
}

/**
 * Dashed "add someone" row — mirrors the web family sidebar's dashed CTA
 * (a plus-in-a-circle + warm copy), swapped in for the plain pill so the
 * roster/cast lists end on the same inviting note as the web page.
 */
function DashedAddRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.dashedRow, style]}
    >
      <View style={st.dashedRowIconWrap}>
        <Text style={st.dashedRowIcon}>{icon}</Text>
      </View>
      <Text style={st.dashedRowLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

/** Roster row with press feedback + a11y. */
function PersonaRow({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.personaRow, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

export default function FamilyTab() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await (force ? refreshHome() : fetchHome());
      setHome(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load your family";
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

  // Issue 107: dev-only seed button. __DEV__ is true in Expo dev builds, false
  // in production/TestFlight. Calls the double-gated /api/dev/seed route.
  async function handleSeed() {
    if (seeding) return;
    setSeeding(true);
    setSeedMsg(null);
    try {
      const result = await seedDemo();
      setSeedMsg(
        result.alreadySeeded
          ? "Already seeded ✓"
          : `Seeded ${result.personas} personas, ${result.characters} characters, ${result.books} books ✓`
      );
      await load();
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  if (shouldShowInitialSkeleton(loading, home !== null)) {
    return (
      <Screen>
        <SkeletonRow />
        <SkeletonRow />
      </Screen>
    );
  }

  const babyName = home?.selectedBaby?.displayName ?? "your baby";
  const personas = home?.personas ?? [];
  const characters = home?.characters ?? [];
  const sections: FamilySection[] = [
    {
      key: "personas",
      title: "Family",
      emoji: "💛",
      count: personas.length,
      data: personas.length > 0
        ? [
            ...personas.map((value): FamilyListItem => ({ kind: "persona", value })),
            { kind: "add-persona", label: `Add someone who loves ${babyName}` },
          ]
        : [
            { kind: "empty", label: `Add someone who loves ${babyName} to draw your family.` },
            { kind: "add-persona", label: `Add someone who loves ${babyName}` },
          ],
    },
    {
      key: "characters",
      title: "Characters",
      emoji: "🐻",
      count: characters.length,
      data: characters.length > 0
        ? [
            ...characters.map((value): FamilyListItem => ({ kind: "character", value })),
            { kind: "add-character", label: "Invent a made-up character" },
          ]
        : [
            { kind: "empty", label: "Invent a free, text-only friend — no photos, no consent gate." },
            { kind: "add-character", label: "Invent a made-up character" },
          ],
    },
  ];

  return (
    <SectionListScreen<FamilyListItem, FamilySection>
      sections={sections}
      keyExtractor={(item) => {
        if (item.kind === "persona") return `persona-${item.value.id}`;
        if (item.kind === "character") return `character-${item.value.id}`;
        return `${item.kind}-${item.label}`;
      }}
      renderSectionHeader={({ section }) => (
        <View style={st.sectionHeader}>
          <Text style={st.sectionTitle}>{section.emoji} {section.title} ({section.count})</Text>
        </View>
      )}
      renderItem={({ item }) => {
        if (item.kind === "persona") {
          const p = item.value;
          return (
            <PersonaRow onPress={() => router.push(`/family/${p.id}` as never)} label={`Open ${p.displayName}`}>
              <RosterAvatar
                name={p.displayName}
                initial={p.displayName.charAt(0)}
                status={p.status}
                avatarKey={p.avatarKey}
                size={46}
              />
              <View style={{ flex: 1 }}>
                <Text style={st.item}>{p.displayName}</Text>
                <Text style={st.metaInline}>
                  {p.kind === "baby" ? "👶 Baby · " : ""}
                  {STATUS_LABEL[p.status] ?? p.status}
                </Text>
              </View>
              <View style={[st.statusDot, { backgroundColor: STATUS_DOT[p.status] ?? C.soft }]} />
              <Text style={st.chev}>›</Text>
            </PersonaRow>
          );
        }
        if (item.kind === "character") return <Text style={st.item}>{item.value.displayName}</Text>;
        if (item.kind === "empty") {
          return (
            <View style={st.emptyInline}>
              <Text style={st.emptyEmoji}>💛</Text>
              <Text style={st.emptyNote}>{item.label}</Text>
            </View>
          );
        }
        return (
          <DashedAddRow
            icon={item.kind === "add-persona" ? "＋" : "🐻"}
            label={item.label}
            onPress={() => router.push(item.kind === "add-persona" ? "/family/new" : "/characters")}
          />
        );
      }}
      ListHeaderComponent={
        <View style={st.listHeader}>
          <View>
            <Eyebrow>💛 {babyName}&apos;s family</Eyebrow>
            <PageTitle>The people in their world</PageTitle>
            <Lead>Real people and made-up friends who star in {babyName}&apos;s stories — drawn and voiced as themselves.</Lead>
          </View>
          {error ? (
            <Card style={st.errorCard}>
              <Text style={st.errorText}>{error}</Text>
            </Card>
          ) : null}
        </View>
      }
      ListFooterComponent={
        __DEV__ ? (
          <MotionCard delay={220}>
            <Text style={st.sectionTitle}>🧪 Dev tools</Text>
            <Text style={st.emptyNote}>
              Populate the Lullabook demo dataset for this Household (idempotent). Requires the paid backend running with DEV_DEMO_SEED=true.
            </Text>
            <AddPill title={seeding ? "Seeding…" : "🧪 Seed demo data"} onPress={handleSeed} disabled={seeding} />
            {seedMsg ? <Text style={st.emptyNote}>{seedMsg}</Text> : null}
          </MotionCard>
        ) : null
      }
      onRefresh={() => load(true)}
      refreshing={loading}
    />
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  listHeader: { gap: 22 },
  sectionHeader: { paddingTop: 12, paddingBottom: 4, backgroundColor: C.bg },
  sectionTitle: { fontSize: 18, fontFamily: F.displayBold, color: C.text },
  item: { fontSize: 16, color: C.text, fontFamily: F.bodyBold },
  emptyInline: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  emptyEmoji: { fontSize: 28 },
  emptyNote: { flex: 1, fontSize: 14, color: C.muted, fontFamily: F.body, lineHeight: 20, marginTop: 4 },
  personaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaInline: { fontSize: 13, color: C.muted, fontFamily: F.body, marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  chev: { color: C.soft, fontSize: 22, fontFamily: F.bodyBold },
  addBtn: {
    marginTop: 14,
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: R.pill,
    backgroundColor: C.primaryBg,
    alignSelf: "flex-start",
  },
  addBtnText: { fontFamily: F.bodyBold, fontSize: 14, color: C.primary },
  dashedRow: {
    marginTop: 14,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.borderDashed,
    borderStyle: "dashed",
    backgroundColor: C.surfaceAlt,
  },
  dashedRowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3A2850",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  dashedRowIcon: { fontSize: 18 },
  dashedRowLabel: { flex: 1, fontFamily: F.bodyBold, fontSize: 14, color: C.soft },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
