import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";

/** ADR-0025 — Two-plan config (shared shape with web paywall-config). */
interface PlanInfo {
  id: string;
  label: string;
  monthlyPrice: number;
  annualPrice: number;
  storyCap: number;
  memberLoginCap: number;
  canNarrate: boolean;
  canVideo: boolean;
  canCustomStyle: boolean;
  isRecommended?: boolean;
  valueProp: string;
}

const PLANS: PlanInfo[] = [
  {
    id: "just_us",
    label: "Just Us",
    monthlyPrice: 9.99,
    annualPrice: 79.99,
    storyCap: 8,
    memberLoginCap: 2,
    canNarrate: false,
    canVideo: false,
    canCustomStyle: false,
    valueProp: "One creating parent, illustrated stories starring your family.",
  },
  {
    id: "our_whole_family",
    label: "Our Whole Family",
    monthlyPrice: 24.99,
    annualPrice: 199.99,
    storyCap: 20,
    memberLoginCap: Infinity,
    canNarrate: true,
    canVideo: true,
    canCustomStyle: true,
    isRecommended: true,
    valueProp: "Everyone creates, voice messages, video pages, and custom art styles.",
  },
];

function PlanCard({
  plan,
  billing,
}: {
  plan: PlanInfo;
  billing: "monthly" | "annual";
}) {
  const price = billing === "annual" ? plan.annualPrice : plan.monthlyPrice;
  const priceLabel = billing === "annual" ? `$${price}/yr` : `$${price}/mo`;
  const features = [
    `${plan.storyCap} stories/mo`,
    plan.memberLoginCap === Infinity ? "Whole family" : `${plan.memberLoginCap} logins`,
    "Illustrated books",
    plan.canNarrate ? "Voice messages + narration" : null,
    plan.canVideo ? "Video pages" : null,
    plan.canCustomStyle ? "Custom art style" : null,
  ].filter(Boolean);

  return (
    <View
      style={[
        st.tierCard,
        plan.isRecommended && {
          borderColor: C.primary,
          borderWidth: 2,
          backgroundColor: C.primaryBg,
        },
      ]}
    >
      {plan.isRecommended ? (
        <View style={st.badgeRec}>
          <Text style={st.badgeRecText}>✨ Recommended</Text>
        </View>
      ) : null}
      <Text style={st.tierLabel}>{plan.label}</Text>
      <Text style={st.tierValue}>{plan.valueProp}</Text>
      <Text style={st.tierPrice}>{priceLabel}</Text>
      {billing === "annual" ? (
        <Text style={st.save}>Save ~17%</Text>
      ) : null}
      <View style={st.features}>
        {features.map((f, i) => (
          <View key={i} style={st.featureRow}>
            <Text style={st.check}>✓</Text>
            <Text style={st.featureText}>{f}</Text>
          </View>
        ))}
      </View>
      <Pressable
        style={[st.chooseBtn, plan.isRecommended ? { backgroundColor: C.primary } : { borderColor: C.primary, borderWidth: 1 }]}
        onPress={() => router.dismiss()}
        accessibilityRole="button"
        accessibilityLabel={`Choose ${plan.label}`}
      >
        <Text style={[st.chooseBtnText, plan.isRecommended ? { color: "#FFFDF9" } : { color: C.primary }]}>
          {plan.id === "our_whole_family" ? "Start 7-day free trial" : `Choose ${plan.label}`}
        </Text>
      </Pressable>
    </View>
  );
}

export default function PaywallScreen() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <Screen>
      <View>
        <Eyebrow>✨ Plans</Eyebrow>
        <PageTitle>Choose your plan</PageTitle>
        <Lead>Every plan starts with a 7-day free trial of the full experience. Cancel anytime.</Lead>
      </View>

      {/* Billing toggle */}
      <View style={st.toggleWrap}>
        <Pressable
          style={[st.toggleBtn, billing === "annual" && { backgroundColor: C.primary }]}
          onPress={() => setBilling("annual")}
        >
          <Text style={[st.toggleText, billing === "annual" && { color: "#FFFDF9" }]}>
            Annual (save 17%)
          </Text>
        </Pressable>
        <Pressable
          style={[st.toggleBtn, billing === "monthly" && { backgroundColor: C.primary }]}
          onPress={() => setBilling("monthly")}
        >
          <Text style={[st.toggleText, billing === "monthly" && { color: "#FFFDF9" }]}>
            Monthly
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} />
        ))}
        <Text style={st.foundingNote}>
          💛 Founding families get the first month free after the trial.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  tierCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 20,
    marginBottom: 12,
  },
  badgeRec: {
    alignSelf: "flex-start",
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: R.pill,
    marginBottom: 8,
  },
  badgeRecText: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: "#FFFDF9",
    letterSpacing: 0.5,
  },
  tierLabel: { fontFamily: F.display, fontSize: 22, color: C.text },
  tierValue: { fontFamily: F.body, fontSize: 14, color: C.muted, marginTop: 4, lineHeight: 20 },
  tierPrice: { fontFamily: F.display, fontSize: 28, color: C.text, marginTop: 12 },
  save: { fontFamily: F.body, fontSize: 12, color: C.accent, marginTop: 2 },
  features: { marginTop: 14, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  check: { color: C.green, fontFamily: F.bodyBold, fontSize: 14 },
  featureText: { fontFamily: F.body, fontSize: 14, color: C.muted, flex: 1 },
  chooseBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: R.pill,
    alignItems: "center",
    backgroundColor: C.surface,
  },
  chooseBtnText: { fontFamily: F.bodyBold, fontSize: 15 },
  toggleWrap: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: C.surfaceAlt,
    borderRadius: R.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
    alignSelf: "flex-start",
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: R.pill,
  },
  toggleText: { fontFamily: F.bodyBold, fontSize: 14, color: C.muted },
  foundingNote: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.soft,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
});
