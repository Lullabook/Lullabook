import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";

interface TierInfo {
  id: string;
  label: string;
  monthlyPrice: number;
  annualPrice: number;
  storyCap: number;
  memberCap: number;
  canNarrate: boolean;
  canVideo: boolean;
  canCustomStyle: boolean;
  isRecommended?: boolean;
  valueProp: string;
}

const TIERS: TierInfo[] = [
  {
    id: "basic",
    label: "Basic",
    monthlyPrice: 8,
    annualPrice: 80,
    storyCap: 4,
    memberCap: 2,
    canNarrate: false,
    canVideo: false,
    canCustomStyle: false,
    valueProp: "Illustrated stories starring your family — the essentials.",
  },
  {
    id: "normal",
    label: "Normal",
    monthlyPrice: 15,
    annualPrice: 150,
    storyCap: 8,
    memberCap: 4,
    canNarrate: true,
    canVideo: false,
    canCustomStyle: false,
    isRecommended: true,
    valueProp: "Narration + voice clips bring stories to life. The sweet spot.",
  },
  {
    id: "plus",
    label: "Plus",
    monthlyPrice: 25,
    annualPrice: 250,
    storyCap: 20,
    memberCap: Infinity,
    canNarrate: true,
    canVideo: true,
    canCustomStyle: true,
    valueProp: "Video pages, custom art styles, and unlimited family members.",
  },
];

function TierCard({
  tier,
  billing,
}: {
  tier: TierInfo;
  billing: "monthly" | "annual";
}) {
  const price = billing === "annual" ? tier.annualPrice : tier.monthlyPrice;
  const priceLabel = billing === "annual" ? `$${price}/yr` : `$${price}/mo`;
  const features = [
    `${tier.storyCap} stories/mo`,
    tier.memberCap === Infinity ? "Unlimited members" : `${tier.memberCap} members`,
    "Illustrated books",
    tier.canNarrate ? "Narration + voice" : null,
    tier.canVideo ? "Video pages" : null,
    tier.canCustomStyle ? "Custom art style" : null,
  ].filter(Boolean);

  return (
    <View
      style={[
        st.tierCard,
        tier.isRecommended && {
          borderColor: C.primary,
          borderWidth: 2,
          backgroundColor: C.primaryBg,
        },
      ]}
    >
      {tier.isRecommended ? (
        <View style={st.badgeRec}>
          <Text style={st.badgeRecText}>✨ Recommended</Text>
        </View>
      ) : null}
      <Text style={st.tierLabel}>{tier.label}</Text>
      <Text style={st.tierValue}>{tier.valueProp}</Text>
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
        style={[st.chooseBtn, tier.isRecommended ? { backgroundColor: C.primary } : { borderColor: C.primary, borderWidth: 1 }]}
        onPress={() => router.dismiss()}
        accessibilityRole="button"
        accessibilityLabel={`Choose ${tier.label}`}
      >
        <Text style={[st.chooseBtnText, tier.isRecommended ? { color: "#FFFDF9" } : { color: C.primary }]}>
          {tier.id === "normal" ? "Start 7-day free trial" : `Choose ${tier.label}`}
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
        <Lead>Every plan starts with a 7-day free trial. Cancel anytime.</Lead>
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
        {TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} billing={billing} />
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
