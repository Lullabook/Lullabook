import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, SkeletonRow, InsetSeparator, MotionCard } from "@/components/maya-ui";
import { RosterAvatar } from "@/components/roster-avatar";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { fetchHome, seedDemo, type HomeResponse } from "@/lib/api";
import { C, F, R } from "@/constants/theme";
import type { PersonaStatus } from "@domain/types";

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHome();
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

  if (loading) {
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

  return (
    <Screen onRefresh={load} refreshing={loading}>
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

      <MotionCard delay={60}>
        <Text style={st.sectionTitle}>💛 Family ({personas.length})</Text>
        <FlatList
          data={personas}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <InsetSeparator indent={56} />}
          ListEmptyComponent={
            <View style={st.emptyInline}>
              <Text style={st.emptyEmoji}>💛</Text>
              <Text style={st.emptyNote}>Add someone who loves {babyName} to draw your family.</Text>
            </View>
          }
          renderItem={({ item: p }) => (
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
          )}
        />
        <DashedAddRow icon="＋" label={`Add someone who loves ${babyName}`} onPress={() => router.push("/family/new")} />
      </MotionCard>

      <MotionCard delay={140}>
        <Text style={st.sectionTitle}>🐻 Characters ({characters.length})</Text>
        <FlatList
          data={characters}
          keyExtractor={(c) => c.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <InsetSeparator indent={0} />}
          ListEmptyComponent={
            <View style={st.emptyInline}>
              <Text style={st.emptyEmoji}>🐻</Text>
              <Text style={st.emptyNote}>Invent a free, text-only friend — no photos, no consent gate.</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <Text style={st.item}>{c.displayName}</Text>
          )}
        />
        <DashedAddRow icon="🐻" label="Invent a made-up character" onPress={() => router.push("/characters")} />
      </MotionCard>

      {/* Issue 107: dev-only seed button. __DEV__ is true only in dev builds. */}
      {__DEV__ ? (
        <MotionCard delay={220}>
          <Text style={st.sectionTitle}>🧪 Dev tools</Text>
          <Text style={st.emptyNote}>
            Populate the Maya&apos;s World demo dataset for this Household (idempotent). Requires the paid backend running with DEV_DEMO_SEED=true.
          </Text>
          <AddPill title={seeding ? "Seeding…" : "🧪 Seed Maya's World"} onPress={handleSeed} disabled={seeding} />
          {seedMsg ? <Text style={st.emptyNote}>{seedMsg}</Text> : null}
        </MotionCard>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
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
