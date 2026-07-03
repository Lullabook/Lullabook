import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, Lead, AnimatedToggle, PrimaryButton } from "@/components/maya-ui";
import { isR1AudioEnabled, isR1MultiFamilyEnabled } from "@/lib/r1-flags";
import { C, F, R } from "@/constants/theme";
import { fetchPaywallConfig, type PaywallPlanResponse } from "@/lib/api";

/** ADR-0025 / issue 129 — plan shape (shared with web paywall-config). */
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

// Issue 129: the visible plans come from the server (/api/paywall-config), so
// the R1 one-plan collapse (R1_ONE_PLAN) is server-authoritative — mobile never
// hardcodes the premium tier. A static fallback keeps the screen renderable if
// the fetch fails before auth.
const FALLBACK_PLANS: PlanInfo[] = [
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
  // R1 doesn't surface Story caps, and member logins are multi-family (cut) —
  // both feature rows stay flag-gated so the paywall never markets a cut.
  const features = [
    "Illustrated storybooks starring your baby",
    "Your family, drawn as themselves",
    "PDF keepsake export",
    ...(isR1MultiFamilyEnabled()
      ? [plan.memberLoginCap === Infinity ? "Whole family" : `${plan.memberLoginCap} logins`]
      : []),
    // Narration is double-gated: the server plan filter withholds it in R1,
    // and the audio cut flag keeps it off even if that filter changes. Video
    // has no mobile flag — it stays server-gated (no R1 plan sets canVideo).
    plan.canNarrate && isR1AudioEnabled() ? "Voice messages + narration" : null,
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
      {/* The trial is the only entry point (R1 one-plan). Purchase wiring
          (RevenueCat IAP) is its own issue; this CTA currently dismisses. */}
      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          title="✨ Start your 7-day free trial"
          onPress={() => router.dismiss()}
        />
      </View>
    </View>
  );
}

function toPlanInfo(p: PaywallPlanResponse): PlanInfo {
  return {
    id: p.id,
    label: p.label,
    monthlyPrice: p.monthlyPrice,
    annualPrice: p.annualPrice,
    storyCap: p.storyCap,
    memberLoginCap: p.memberLoginCap,
    canNarrate: p.canNarrate,
    canVideo: p.canVideo,
    canCustomStyle: p.canCustomStyle,
    isRecommended: p.isRecommended,
    valueProp: p.valueProp,
  };
}

export default function PaywallScreen() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [plans, setPlans] = useState<PlanInfo[]>(FALLBACK_PLANS);

  // Issue 129: fetch the R1-visible plans from the server so the one-plan
  // collapse is server-authoritative (R1_ONE_PLAN), not duplicated here.
  useEffect(() => {
    let cancelled = false;
    fetchPaywallConfig()
      .then((cfg) => {
        if (!cancelled) setPlans(cfg.plans.map(toPlanInfo));
      })
      .catch(() => {
        // Keep the fallback — never a red-screen over a config fetch.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen>
      <View>
        <Eyebrow>✨ Plans</Eyebrow>
        <Lead>Every plan starts with a 7-day free trial of the full experience. Cancel anytime.</Lead>
      </View>

      {/* Billing toggle — Issue 144: animated segmented control (sliding indicator) */}
      <AnimatedToggle
        options={[
          { key: "annual" as const, label: "Annual (save 17%)" },
          { key: "monthly" as const, label: "Monthly" },
        ]}
        value={billing}
        onChange={(k) => setBilling(k)}
      />

      {/* Issue 138 — removed the nested ScrollView that broke paywall scroll
          momentum; plans render directly in Screen's scroll view. */}
      <View>
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} />
        ))}
        <Text style={st.foundingNote}>
          💛 Founding families get the first month free after the trial.
        </Text>
      </View>
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
    color: C.surface,
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
  foundingNote: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.soft,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
});
