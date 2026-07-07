import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import {
  Screen,
  Eyebrow,
  PageTitle,
  Lead,
  Card,
  Chip,
  EmptyState,
  PrimaryButton,
  SkeletonCard,
  ListScreen,
  InsetSeparator,
  BrandGradient,
} from "@/components/maya-ui";
import { usePressFeedback } from "@/lib/use-press-feedback";
import {
  createMoment,
  fetchHome,
  listMoments,
  type HomeResponse,
  type MomentWire,
} from "@/lib/api";
import { isR1JournalMachineryEnabled } from "@/lib/r1-flags";
import { C, F } from "@/constants/theme";
import type { MomentType } from "@domain/daily-types";

type Filter = "all" | "firsts";

const TYPES: { key: MomentType; icon: string; label: string }[] = [
  { key: "milestone", icon: "🌟", label: "Milestone" },
  { key: "first", icon: "✨", label: "A first" },
  { key: "funny", icon: "😄", label: "Funny" },
  { key: "tough", icon: "🫂", label: "Tough day" },
  { key: "cozy", icon: "🌙", label: "Cozy" },
];

function meta(t: MomentType) {
  switch (t) {
    case "first":
      return { icon: "✨", label: "A first", bg: "#FBEBCE", fg: "#9A6B1E" };
    case "funny":
      // Canonical rose tag family (design REFERENCE §small tag color families).
      return { icon: "😄", label: "Funny", bg: "#FCE4EC", fg: "#B5618A" };
    case "tough":
      return { icon: "🫂", label: "Tough day", bg: "#E1F1E8", fg: "#3E7A5A" };
    case "cozy":
      return { icon: "🌙", label: "Cozy", bg: C.primaryBg, fg: C.primary };
    default:
      return { icon: "🌟", label: "Milestone", bg: "#EDE7FE", fg: "#6A55C9" };
  }
}

function formatWhen(m: MomentWire): string {
  const today = new Date().toISOString().slice(0, 10);
  if (m.occurredOn === today) return "Today";
  const d = new Date(`${m.occurredOn}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const AnimatedPressable = createAnimatedComponent(Pressable);

/** A Moment row (needs its own component so the press-feedback hook can run). */
function MomentRow({ m, mm }: { m: MomentWire; mm: ReturnType<typeof meta> }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <View style={[st.moment, m.isSignificant && st.momentSignificant]}>
      <View style={[st.momentIcon, { backgroundColor: mm.bg }]}>
        <Text style={{ fontSize: 22 }}>{mm.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={st.momentMetaRow}>
          <View style={[st.tag, { backgroundColor: mm.bg }]}>
            <Text style={[st.tagText, { color: mm.fg }]}>{mm.label}</Text>
          </View>
          {m.isSignificant ? <Text style={st.spark}>✨</Text> : null}
          <Text style={st.momentDate}>{formatWhen(m)}</Text>
        </View>
        <Text style={st.momentText}>{m.body}</Text>
        <AnimatedPressable
          onPress={() =>
            router.push({ pathname: "/create", params: { theme: m.body } } as never)
          }
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Make this moment a story"
          style={[st.turnBtn, style]}
        >
          <Text style={st.turnBtnText}>✨ Make this a Story</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export default function DailyScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [moments, setMoments] = useState<MomentWire[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<MomentType>("milestone");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const babyId = home?.selectedBaby?.id ?? null;
  const babyName = home?.selectedBaby?.displayName ?? "your baby";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHome();
      setHome(data);
      const id = data.selectedBaby?.id;
      if (id) {
        const listed = await listMoments(id);
        setMoments(listed.moments);
      } else {
        setMoments([]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load journal";
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

  async function add() {
    const text = draft.trim();
    if (!text || !babyId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createMoment({
        babyId,
        body: text,
        momentType: type,
        significant: type === "first" || type === "milestone",
      });
      setDraft("");
      const listed = await listMoments(babyId);
      setMoments(listed.moments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save moment");
    } finally {
      setSaving(false);
    }
  }

  const visible = moments.filter((m) =>
    filter === "firsts" ? m.momentType === "first" || m.momentType === "milestone" : true
  );

  if (loading) {
    return (
      <Screen>
        <SkeletonCard />
        <SkeletonCard lines={2} />
      </Screen>
    );
  }

  return (
    <ListScreen
      data={visible}
      keyExtractor={(m) => m.id}
      renderItem={({ item: m }) => <MomentRow m={m} mm={meta(m.momentType)} />}
      ListHeaderComponent={
        <>
          <View>
            <Eyebrow>📔 {babyName}&apos;s days</Eyebrow>
            <PageTitle>Daily Life</PageTitle>
            <Lead>
              {filter === "firsts"
                ? `Celebrate ${babyName}'s milestones — then turn one into a Story when you're ready.`
                : "Jot down the little moments and the routine. Lullabook weaves them into stories that feel like real days."}
            </Lead>
          </View>

          <View style={st.filterRow}>
            <Chip icon="📔" label="All moments" active={filter === "all"} onPress={() => setFilter("all")} />
            {/* Issue 148 — Firsts view deferred from R1 (journal machinery cut).
                The chip is gated off so the deferred surface has no reachable UI. */}
            {isR1JournalMachineryEnabled() ? (
              <Chip icon="✨" label="Firsts" active={filter === "firsts"} onPress={() => setFilter("firsts")} />
            ) : null}
          </View>

          {error ? (
            <Card style={st.errorCard}>
              <Text style={st.errorText}>{error}</Text>
            </Card>
          ) : null}

          {!babyId ? (
            <Card>
              <Text style={st.cardTitle}>Add a Baby first</Text>
              <Text style={st.copy}>Moments belong to a Baby&apos;s Journal. Add family to create one.</Text>
            </Card>
          ) : (
            <Card>
              <Text style={st.h}>What happened today?</Text>
              <Text style={st.subcopy}>A milestone, a giggle, a hard nap day — anything worth remembering.</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder="Waved bye-bye to Nani all by herself…"
                placeholderTextColor="#B7A992"
                style={st.textarea}
              />
              <View style={st.chipRow}>
                {TYPES.map((t) => (
                  <Chip
                    key={t.key}
                    icon={t.icon}
                    label={t.label}
                    active={type === t.key}
                    onPress={() => setType(t.key)}
                  />
                ))}
              </View>
              <PrimaryButton
                title={saving ? "Saving…" : "＋ Add moment"}
                disabled={!draft.trim() || saving}
                onPress={add}
              />
            </Card>
          )}

          <Text style={st.section}>{filter === "firsts" ? "Firsts timeline" : "Recent moments"}</Text>
        </>
      }
      ListEmptyComponent={
        <EmptyState
          emoji="📔"
          title={filter === "firsts" ? "No firsts yet" : "No moments yet"}
          hint={
            filter === "firsts"
              ? "Log a ✨ moment and it will show up here."
              : "Jot the first little win above — even 'giggled at the ceiling fan' counts."
          }
        />
      }
      ListFooterComponent={
        <BrandGradient colors={["#6A55C9", "#B5739E"]} fallback={C.primary} style={st.why}>
          <Text style={st.whyTitle}>Why this helps ✨</Text>
          <Text style={st.whyText}>
            Real moments teach Lullabook who {babyName} is — so every Story sounds like their actual life.
          </Text>
        </BrandGradient>
      }
      ItemSeparatorComponent={() => <InsetSeparator indent={56} />}
      onRefresh={load}
      refreshing={loading}
    />
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  copy: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted },
  h: { fontFamily: F.displayBold, fontSize: 17, color: C.text },
  subcopy: { fontFamily: F.body, fontSize: 14, color: C.soft, marginTop: -6 },
  textarea: {
    minHeight: 84,
    fontFamily: F.body,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    textAlignVertical: "top",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  section: { fontFamily: F.displayBold, fontSize: 22, color: C.text, marginTop: 4 },
  moment: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  momentSignificant: { borderColor: C.accent, borderWidth: 1.5 },
  momentIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  momentMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 12, fontFamily: F.bodyBold },
  spark: { fontSize: 14 },
  momentDate: { fontSize: 12, color: C.faint, fontFamily: F.bodyBold, marginLeft: "auto" },
  momentText: { color: C.text, fontFamily: F.body, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  turnBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
  },
  turnBtnText: { color: C.primary, fontFamily: F.bodyBold, fontSize: 13 },
  why: { backgroundColor: C.primary, borderRadius: 20, padding: 18, gap: 6 },
  whyTitle: { color: C.surface, fontFamily: F.displayBold, fontSize: 16 },
  whyText: { color: "rgba(255,253,249,0.85)", fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
