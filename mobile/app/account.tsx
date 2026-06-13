import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Card, PrimaryButton, GhostButton, Field } from "@/components/maya-ui";
import { C } from "@/constants/theme";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const PERKS = [
  { icon: "🎨", title: "Illustrated personas", note: "Family drawn as themselves" },
  { icon: "🎙️", title: "Real voices", note: "They read every page" },
  { icon: "📚", title: "Unlimited stories", note: "Make as many as you like" },
  { icon: "⬇️", title: "PDF & print export", note: "Keep them forever" },
];
const PRIVACY = [
  "Photos and likeness models are encrypted and never shared.",
  "Storybooks are private to your family unless you share a link.",
  "Canceling starts a 30-day export window before everything is purged.",
];

export default function AccountScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState("");

  useEffect(() => {
    fetchHome().then(setHome).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  if (loading) {
    return <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  const email = home?.member.email ?? "you@example.com";
  const subscribed = home?.subscriptionActive ?? false;

  return (
    <Screen>
      <View>
        <Eyebrow>⚙️ Your account</Eyebrow>
        <PageTitle>Account & family</PageTitle>
      </View>

      {/* profile header */}
      <View style={st.profile}>
        <View style={st.profileAvatar}><Text style={st.profileInitial}>{email[0]?.toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={st.profileName}>{email}</Text>
          <Text style={st.profileSub}>Guardian of your family</Text>
          <View style={st.planPill}><Text style={st.planPillText}>{subscribed ? "✨ Illustrated plan" : "Free plan"}</Text></View>
        </View>
      </View>

      {/* plan */}
      <Card>
        <Text style={st.cardTitle}>{subscribed ? "✨ Illustrated plan" : "Free plan"}</Text>
        <Text style={st.cardMeta}>{subscribed ? "$12 / month · renews Jul 7, 2026" : "Upgrade to draw your family and hear their voices."}</Text>
        <View style={st.perkGrid}>
          {PERKS.map((p) => (
            <View key={p.title} style={st.perk}>
              <Text style={{ fontSize: 18 }}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.perkTitle}>{p.title}</Text>
                <Text style={st.perkNote}>{p.note}</Text>
              </View>
            </View>
          ))}
        </View>
        {/* TODO: wire to Stripe customer portal / checkout */}
        {subscribed ? <GhostButton title="Manage billing" /> : <PrimaryButton title="✨ Upgrade to Illustrated" />}
      </Card>

      {/* family members — TODO: fetch real members + roles from an endpoint */}
      <Card>
        <Text style={st.cardTitle}>💛 Family members</Text>
        <Field label="Invite someone who loves them" placeholder="grandma@example.com" autoCapitalize="none" keyboardType="email-address" value={invite} onChangeText={setInvite} />
        <PrimaryButton title="Send invite" onPress={() => { /* TODO: invite endpoint */ }} />
      </Card>

      {/* privacy */}
      <Card>
        <Text style={st.cardTitle}>🔒 Privacy & your data</Text>
        {PRIVACY.map((p) => (
          <View key={p} style={{ flexDirection: "row", gap: 10 }}>
            <Text style={{ color: C.greenText }}>✓</Text>
            <Text style={{ flex: 1, color: C.muted, fontSize: 14, lineHeight: 20 }}>{p}</Text>
          </View>
        ))}
      </Card>

      {/* danger */}
      <View style={[st.cardDanger]}>
        <Text style={[st.cardTitle, { color: C.danger }]}>Delete everything</Text>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
          Photos, trained models, storybooks, and account data are erased from our database and file storage. This cannot be undone.
        </Text>
        <GhostButton danger title="Delete my account & all data" onPress={() => { /* TODO: hard-delete flow */ }} />
        <Pressable onPress={signOut} style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ color: C.primary, fontWeight: "800" }}>Sign out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  profile: { flexDirection: "row", gap: 14, alignItems: "center", backgroundColor: C.primary, borderRadius: 26, padding: 20 },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.rose, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.55)" },
  profileInitial: { color: "#fff", fontWeight: "800", fontSize: 26 },
  profileName: { color: "#fff", fontWeight: "800", fontSize: 18 },
  profileSub: { color: "#FBEAF3", fontSize: 13, marginTop: 2 },
  planPill: { alignSelf: "flex-start", marginTop: 8, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  planPillText: { color: C.badgeGoldText, fontWeight: "800", fontSize: 12 },
  cardTitle: { fontWeight: "800", fontSize: 18, color: C.text },
  cardMeta: { color: C.muted, fontSize: 14, marginTop: -6 },
  perkGrid: { gap: 10 },
  perk: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: C.bg, borderColor: C.borderSoft, borderWidth: 1, borderRadius: 16, padding: 12 },
  perkTitle: { fontWeight: "800", fontSize: 14, color: C.text },
  perkNote: { fontSize: 12, color: C.soft, marginTop: 2 },
  cardDanger: { backgroundColor: C.surface, borderColor: C.dangerBorder, borderWidth: 1, borderRadius: 22, padding: 18, gap: 14 },
});
