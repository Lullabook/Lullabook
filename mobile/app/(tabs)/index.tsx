import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, PrimaryButton, GhostButton } from "@/components/maya-ui";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { RosterAvatar } from "@/components/roster-avatar";
import { C, F } from "@/constants/theme";
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

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  if (loading) {
    return (
      <View style={st.center} accessibilityLabel="Loading home">
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const emptyRoster =
    !!home && home.characters.length === 0 && home.personas.length === 0;

  return (
    <Screen>
      <View>
        <Eyebrow>💛 Your family</Eyebrow>
        <PageTitle>Your Family</PageTitle>
        {home ? <Lead>{home.member.email}</Lead> : null}
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {home ? (
        <>
          <Card>
            <Text style={st.copy}>
              {emptyRoster
                ? "Start with a free Character and text Story — no subscription needed."
                : home.trainingExpectationCopy}
            </Text>
          </Card>

          <Card>
            <Text style={st.cardTitle}>🐻 Characters ({home.characters.length})</Text>
            {home.characters.length === 0 ? (
              <Text style={st.emptyNote}>No characters yet — invent a made-up friend.</Text>
            ) : (
              home.characters.map((c) => (
                <Text key={c.id} style={st.item}>
                  {c.displayName}
                </Text>
              ))
            )}
          </Card>

          <Card>
            <Text style={st.cardTitle}>💛 Family ({home.personas.length})</Text>
            {home.personas.length === 0 ? (
              <Text style={st.emptyNote}>Add someone who loves them to draw your family.</Text>
            ) : (
              home.personas.map((p) => (
                <View key={p.id} style={st.personaRow}>
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
                </View>
              ))
            )}
          </Card>

          <View style={st.planRow}>
            <View style={[st.planDot, { backgroundColor: home.subscriptionActive ? C.green : C.accent }]} />
            <Text style={st.meta}>
              Subscription: {home.subscriptionActive ? "active" : "free tier"}
            </Text>
          </View>
        </>
      ) : null}

      <PrimaryButton title="↻ Refresh" onPress={load} />
      <GhostButton title="Sign out" onPress={signOut} />
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  copy: { fontFamily: F.body, fontSize: 16, lineHeight: 23, color: C.text },
  cardTitle: { fontSize: 18, fontFamily: F.displayBold, color: C.text },
  item: { fontSize: 16, color: C.text, fontFamily: F.bodyBold },
  emptyNote: { fontSize: 14, color: C.soft, fontFamily: F.body, lineHeight: 20 },
  personaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaInline: { fontSize: 13, color: C.muted, fontFamily: F.body, marginTop: 1 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planDot: { width: 9, height: 9, borderRadius: 5 },
  meta: { fontSize: 14, color: C.muted, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
