import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, Lead, AnimatedToggle, PrimaryButton } from "@/components/maya-ui";
import { isR1AudioEnabled, isR1MultiFamilyEnabled } from "@/lib/r1-flags";
import { C, F, R } from "@/constants/theme";
import { fetchPaywallConfig, type PaywallPlanResponse } from "@/lib/api";
import { getPurchaseController } from "@/lib/purchases";
import { getR1PlanFeatureLabels, R1_FALLBACK_PLAN } from "@domain/plan";

type PlanInfo = PaywallPlanResponse;

// The offline fallback imports the shared domain contract; no mobile copy of
// prices, limits, or capabilities can drift from the server definition.
const FALLBACK_PLANS: PlanInfo[] = [R1_FALLBACK_PLAN];

function PlanCard({
  plan,
  billing,
  onStartTrial,
  trialBusy,
  trialError,
}: {
  plan: PlanInfo;
  billing: "monthly" | "annual";
  onStartTrial: () => void;
  trialBusy: boolean;
  trialError: string | null;
}) {
  const price = billing === "annual" ? plan.pricing.annual : plan.pricing.monthly;
  const priceLabel = billing === "annual" ? `$${price}/yr` : `$${price}/mo`;
  // ADR-0028: the accepted R1 plan markets its real caps — Storybooks per
  // monthly reset, trained Personas, and starring Personas per Storybook —
  // sourced from the same server plan (fallback mirrors src/domain/plan.ts).
  const features = [
    "Illustrated storybooks starring your baby",
    "Your family, drawn as themselves",
    ...getR1PlanFeatureLabels(plan),
    "PDF keepsake export",
    ...(isR1MultiFamilyEnabled()
      ? [plan.limits.memberLogins === Infinity ? "Whole family" : `${plan.limits.memberLogins} logins`]
      : []),
    // Narration is double-gated: the server plan filter withholds it in R1,
    // and the audio cut flag keeps it off even if that filter changes. Video
    // has no mobile flag — it stays server-gated (no R1 plan sets canVideo).
    plan.capabilities.canNarrate && isR1AudioEnabled() ? "Voice messages + narration" : null,
    plan.capabilities.canVideo ? "Video pages" : null,
    plan.capabilities.canCustomStyle ? "Custom art style" : null,
  ].filter(Boolean);

  const cardBody = (
    <>
      <Text style={st.tierLabel}>{plan.label}</Text>
      <Text style={st.tierValue}>{plan.valueProp}</Text>
      <View style={st.priceRow}>
        <Text style={st.tierPrice}>{priceLabel}</Text>
        {billing === "annual" ? <Text style={st.save}>(save ~17%)</Text> : null}
      </View>
      <View style={st.features}>
        {features.map((f, i) => (
          <View key={i} style={st.featureRow}>
            <Text style={st.check}>✓</Text>
            <Text style={st.featureText}>{f}</Text>
          </View>
        ))}
      </View>
      {/* Issue 171 (D5): the CTA runs the PurchaseController seam (issue
          170). Success = the controller refetched a server-verified
          entitlement → dismiss back to the unlocked action. Failure =
          retryable inline error; the Household stays unentitled (FAIL-2) —
          never an optimistic local unlock. */}
      <View style={{ marginTop: 16 }}>
        {trialError ? <Text style={st.trialError}>{trialError}</Text> : null}
        <PrimaryButton
          title={trialBusy ? "Starting your trial…" : "✨ Start your 7-day free trial"}
          disabled={trialBusy}
          onPress={onStartTrial}
        />
      </View>
    </>
  );

  return <View style={st.tierCard}>{cardBody}</View>;
}

export default function PaywallScreen() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [plans, setPlans] = useState<PlanInfo[]>(FALLBACK_PLANS);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  // Issue 171 (D5/FAIL-2): start the trial through the PurchaseController
  // seam — entitlement comes back server-verified (SEC-1); this screen never
  // flips a local entitlement bit. On failure the button stays enabled for
  // retry and the user remains on the paywall.
  async function startTrial() {
    if (trialBusy) return;
    setTrialBusy(true);
    setTrialError(null);
    const result = await getPurchaseController().startTrial();
    setTrialBusy(false);
    if (result.ok) {
      router.dismiss();
    } else {
      setTrialError(result.error);
    }
  }

  // Issue 129: fetch the R1-visible plans from the server so the one-plan
  // collapse is server-authoritative (R1_ONE_PLAN), not duplicated here.
  useEffect(() => {
    let cancelled = false;
    fetchPaywallConfig()
      .then((cfg) => {
        if (!cancelled) setPlans(cfg.plans);
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
        <Lead>
          Every plan starts with a 7-day free trial of the full experience. Your card stays on
          file as verifiable parental consent — cancel anytime.
        </Lead>
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
          <PlanCard
            key={plan.plan}
            plan={plan}
            billing={billing}
            onStartTrial={startTrial}
            trialBusy={trialBusy}
            trialError={trialError}
          />
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
  tierLabel: { fontFamily: F.display, fontSize: 22, color: C.text },
  tierValue: { fontFamily: F.body, fontSize: 14, color: C.muted, marginTop: 4, lineHeight: 20 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 12 },
  tierPrice: { fontFamily: F.display, fontSize: 28, color: C.text },
  save: { fontFamily: F.body, fontSize: 12, color: C.soft },
  features: { marginTop: 14, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  check: { color: C.green, fontFamily: F.bodyBold, fontSize: 14 },
  featureText: { fontFamily: F.body, fontSize: 14, color: C.muted, flex: 1 },
  trialError: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.danger,
    marginBottom: 8,
    lineHeight: 18,
  },
  foundingNote: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.soft,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
});
