import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { BrandGradient, HERO_GRAD, Screen, Eyebrow, PageTitle, Card, PrimaryButton, GhostButton, Field, SkeletonCard, SkeletonRow } from "@/components/maya-ui";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { C, F } from "@/constants/theme";

const AnimatedPressable = createAnimatedComponent(Pressable);

function SignOutLink({ onPress }: { onPress: () => void }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      style={[{ alignItems: "center", justifyContent: "center", minHeight: 44, paddingVertical: 8 }, style]}
    >
      <Text style={{ color: C.primary, fontFamily: F.bodyBold, fontSize: 15 }}>Sign out</Text>
    </AnimatedPressable>
  );
}
import { fetchHome, hardDeleteAccount, type HomeResponse } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { isR1MultiFamilyEnabled, isR1AudioEnabled, R1_CUT_MESSAGE } from "@/lib/r1-flags";

// Issue 145/146 — cut features are gated off here so no dead surface is reachable.
const PERKS = [
  { icon: "🎨", title: "Illustrated family", note: "Everyone drawn as themselves" },
  ...(isR1AudioEnabled() ? [{ icon: "🎙️", title: "Real voices", note: "They read every page" }] : []),
  { icon: "📚", title: "Unlimited stories", note: "Make as many as you like" },
  { icon: "⬇️", title: "PDF & print export", note: "Keep them forever" },
];
// R1 has no Share links (cut to R2) — a child's likeness leaves the device
// only via your own PDF export, and the privacy copy says exactly that.
const PRIVACY = [
  "Photos and likeness models are encrypted and never shared.",
  "Storybooks stay private to your family — nothing is ever public.",
  "Canceling starts a 30-day export window before everything is purged.",
];

export default function AccountScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchHome().then(setHome).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  function confirmHardDelete() {
    Alert.alert(
      "Delete everything?",
      "This will erase the Family's photos, storybooks, and account data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            setNotice(null);
            try {
              await hardDeleteAccount();
              await supabase.auth.signOut();
              router.replace("/sign-in");
            } catch (e) {
              setNotice(e instanceof Error ? e.message : "Could not delete account");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <Screen>
        <SkeletonRow />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  const email = home?.member.email ?? "Your account";
  const subscribed = home?.subscriptionActive ?? false;

  return (
    <Screen>
      <View>
        <Eyebrow>⚙️ Your account</Eyebrow>
        <PageTitle>Account & family</PageTitle>
      </View>

      {/* profile header */}
      <BrandGradient colors={HERO_GRAD} fallback={C.primary} style={st.profile}>
        <View style={st.profileAvatar}><Text style={st.profileInitial}>{email[0]?.toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={st.profileName}>{email}</Text>
          <Text style={st.profileSub}>Guardian of your family</Text>
          <View style={st.planPill}><Text style={st.planPillText}>{subscribed ? "✨ Plan active" : "🌙 Trial available"}</Text></View>
        </View>
      </BrandGradient>

      {/* plan — R1 has no free tier; no fabricated prices or renewal dates
          (server-side entitlement is the only source of billing truth). */}
      <Card>
        <Text style={st.cardTitle}>{subscribed ? "✨ Your plan" : "🌙 Start your free trial"}</Text>
        <Text style={st.cardMeta}>
          {subscribed
            ? "Your plan is active — manage or cancel anytime in your App Store subscriptions."
            : "Every plan starts with a 7-day free trial — your family, drawn as themselves in every story."}
        </Text>
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
        {subscribed ? (
          <GhostButton title="Manage billing" onPress={() => router.push("/billing")} />
        ) : (
          <PrimaryButton title="✨ Start your 7-day free trial" onPress={() => router.push("/billing")} />
        )}
      </Card>

      {/* Issue 146 — invite form gated off when multi-family is cut (no dead surface). */}
      {isR1MultiFamilyEnabled() ? (
        <Card>
          <Text style={st.cardTitle}>💛 Family members</Text>
          <Field label="Invite someone who loves them" placeholder="grandma@example.com" autoCapitalize="none" keyboardType="email-address" />
          <PrimaryButton title="Send invite" onPress={() => {}} />
        </Card>
      ) : null}

      {notice ? (
        <Card style={st.noticeCard}>
          <Text style={st.noticeText}>{notice}</Text>
        </Card>
      ) : null}

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
        <GhostButton danger title={deleting ? "Deleting…" : "Delete my account & all data"} onPress={confirmHardDelete} />
        <SignOutLink onPress={signOut} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  profile: { flexDirection: "row", gap: 14, alignItems: "center", borderRadius: 26, padding: 20 },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.rose, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,253,249,0.55)" },
  profileInitial: { color: C.surface, fontFamily: F.displayBold, fontSize: 26 },
  profileName: { color: C.surface, fontFamily: F.displayBold, fontSize: 18 },
  profileSub: { color: "rgba(255,253,249,0.85)", fontFamily: F.body, fontSize: 13, marginTop: 2 },
  planPill: { alignSelf: "flex-start", marginTop: 8, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  planPillText: { color: C.badgeGoldText, fontFamily: F.bodyBold, fontSize: 12 },
  cardTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  cardMeta: { color: C.muted, fontFamily: F.body, fontSize: 14, marginTop: -6 },
  perkGrid: { gap: 10 },
  perk: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: C.bg, borderColor: C.borderSoft, borderWidth: 1, borderRadius: 18, padding: 12 },
  perkTitle: { fontFamily: F.bodyBold, fontSize: 14, color: C.text },
  perkNote: { fontFamily: F.body, fontSize: 12, color: C.soft, marginTop: 2 },
  cardDanger: { backgroundColor: C.surface, borderColor: C.dangerBorder, borderWidth: 1, borderRadius: 22, padding: 18, gap: 14 },
  noticeCard: { backgroundColor: C.primaryBg, borderColor: C.primaryLight },
  noticeText: { color: C.primary, fontFamily: F.bodyBold, fontSize: 14, lineHeight: 20 },
});
