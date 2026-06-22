import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card } from "@/components/maya-ui";
import { RosterAvatar } from "@/components/roster-avatar";
import { fetchHome, seedDemo, type HomeResponse } from "@/lib/api";
import { C, F, R } from "@/constants/theme";

export default function FamilyTab() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHome();
      setHome(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load";
      if (message.includes("Unauthorized") || message.includes("Missing bearer")) {
        router.replace("/sign-in");
        return;
      }
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
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const personas = home?.personas ?? [];
  const characters = home?.characters ?? [];

  return (
    <Screen>
      <View>
        <Eyebrow>💛 Family</Eyebrow>
        <PageTitle>Family & Characters</PageTitle>
        <Lead>Everyone who stars in {home?.selectedBaby?.displayName ?? "your baby"}&apos;s stories.</Lead>
      </View>

      <Card>
        <Text style={st.sectionTitle}>💛 Family ({personas.length})</Text>
        {personas.length === 0 ? (
          <Text style={st.emptyNote}>Add someone who loves them to draw your family.</Text>
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            {personas.map((p) => (
              <Pressable key={p.id} style={st.personaRow} onPress={() => router.push(`/family/${p.id}` as never)}>
                <RosterAvatar
                  name={p.displayName}
                  initial={p.displayName.charAt(0)}
                  status={p.status}
                  avatarKey={p.avatarKey}
                  size={44}
                />
                <View style={{ flex: 1 }}>
                  <Text style={st.item}>{p.displayName}</Text>
                  <Text style={st.metaInline}>{p.status}</Text>
                </View>
                <Text style={st.chev}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable style={st.addBtn} onPress={() => router.push("/family/new")}>
          <Text style={st.addBtnText}>＋ Add family member</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={st.sectionTitle}>🐻 Characters ({characters.length})</Text>
        {characters.length === 0 ? (
          <Text style={st.emptyNote}>Invent a free, text-only friend.</Text>
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {characters.map((c) => (
              <Text key={c.id} style={st.item}>{c.displayName}</Text>
            ))}
          </View>
        )}
        <Pressable style={st.addBtn} onPress={() => router.push("/characters")}>
          <Text style={st.addBtnText}>＋ Create character</Text>
        </Pressable>
      </Card>

      {/* Issue 107: dev-only seed button. __DEV__ is true only in dev builds. */}
      {__DEV__ ? (
        <Card>
          <Text style={st.sectionTitle}>🧪 Dev tools</Text>
          <Text style={st.emptyNote}>
            Populate the Maya's World demo dataset for this Household (idempotent). Requires the paid backend running with DEV_DEMO_SEED=true.
          </Text>
          <Pressable style={st.addBtn} onPress={handleSeed} disabled={seeding}>
            <Text style={st.addBtnText}>{seeding ? "Seeding…" : "🧪 Seed Maya's World"}</Text>
          </Pressable>
          {seedMsg ? <Text style={st.emptyNote}>{seedMsg}</Text> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  sectionTitle: { fontSize: 18, fontFamily: F.displayBold, color: C.text },
  item: { fontSize: 16, color: C.text, fontFamily: F.bodyBold },
  emptyNote: { fontSize: 14, color: C.soft, fontFamily: F.body, lineHeight: 20, marginTop: 4 },
  personaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaInline: { fontSize: 13, color: C.muted, fontFamily: F.body, marginTop: 1 },
  chev: { color: C.soft, fontSize: 22, fontFamily: F.bodyBold },
  addBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: R.pill,
    backgroundColor: C.primaryBg,
    alignSelf: "flex-start",
  },
  addBtnText: { fontFamily: F.bodyBold, fontSize: 14, color: C.primary },
});
