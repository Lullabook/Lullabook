"use client";

import { useState } from "react";
import Link from "next/link";
import { getR1VisiblePlans, type PaywallPlan } from "@/lib/paywall-config";
import { SubmitButton } from "@/components/submit-button";
import { startCheckoutFormAction } from "@/lib/actions";

const cardStyle: React.CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

const recommendedStyle: React.CSSProperties = {
  ...cardStyle,
  border: "2px solid #6A55C9",
  boxShadow: "0 12px 32px rgba(106,85,201,0.18)",
  background: "linear-gradient(180deg,#FFFDF9,#F6F1FF)",
};

function TierCard({
  tier,
  billing,
  currentTier,
}: {
  tier: PaywallPlan;
  billing: "monthly" | "annual";
  currentTier?: string;
}) {
  const isCurrent = currentTier === tier.id;
  const isRecommended = tier.isRecommended;
  const price = billing === "annual" ? tier.annualPrice : tier.monthlyPrice;
  const priceLabel = billing === "annual" ? `$${price}/yr` : `$${price}/mo`;

  const features: string[] = [
    `${tier.storyCap} Storybooks per month`,
    `${tier.memberCap} trained Personas`,
    `Up to ${tier.starringPersonaCap} starring Personas per Storybook`,
    "Illustrated storybooks",
    tier.canNarrate ? "Narration + voice clips" : "—",
    tier.canVideo ? "Video pages (2 included)" : "—",
    tier.canCustomStyle ? "Custom art style (1 training included)" : "—",
  ].filter((f) => !f.startsWith("—") || tier.id === "just_us");

  return (
    <div style={isRecommended ? recommendedStyle : cardStyle}>
      {isRecommended && (
        <div
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            background: "#6A55C9",
            color: "#FFFDF9",
            fontSize: "0.72rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          ✨ Recommended
        </div>
      )}
      {isCurrent && (
        <div
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            background: "#E1F1E8",
            color: "#3C7556",
            fontSize: "0.72rem",
            fontWeight: 800,
            marginLeft: isRecommended ? 8 : 0,
          }}
        >
          Current plan
        </div>
      )}
      <h3
        style={{
          margin: "0 0 4px",
          fontFamily: "var(--v2-font-display)",
          fontWeight: 800,
          fontSize: "1.4rem",
          color: "#2E2438",
        }}
      >
        {tier.label}
      </h3>
      <p style={{ margin: "0 0 14px", color: "#6E6076", fontSize: "0.88rem", lineHeight: 1.4 }}>
        {tier.valueProp}
      </p>
      <div style={{ marginBottom: 16 }}>
        <span
          style={{
            fontFamily: "var(--v2-font-display)",
            fontWeight: 800,
            fontSize: "2rem",
            color: "#2E2438",
          }}
        >
          {priceLabel}
        </span>
        {billing === "annual" && (
          <span style={{ color: "#9A8A78", fontSize: "0.82rem", marginLeft: 6 }}>
            (save ~17%)
          </span>
        )}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {features.map((f, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              color: "#6E6076",
              fontSize: "0.88rem",
              lineHeight: 1.4,
            }}
          >
            <span style={{ color: "#5FB389", fontWeight: 800, flexShrink: 0 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      {!isCurrent && (
        <form action={startCheckoutFormAction}>
          <SubmitButton
            className={`v2-btn ${isRecommended ? "v2-btn--primary" : "v2-btn--outline"}`}
            label={tier.id === "our_whole_family" ? "Start 7-day free trial" : `Choose ${tier.label}`}
            pendingLabel="Redirecting…"
          />
        </form>
      )}
    </div>
  );
}

export function PaywallUI({ currentTier }: { currentTier?: string }) {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <div className="v2-stack" style={{ gap: 18 }}>
      <div>
        <p className="v2-eyebrow">✨ Plans</p>
        <h1 className="v2-page-title">Choose your plan</h1>
        <p className="v2-page-lead">
          Every plan starts with a 7-day free trial. Your card stays on file as
          verifiable parental consent — cancel anytime.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          background: "#FFF8EC",
          borderRadius: 999,
          width: "fit-content",
          border: "1px solid #ECE1CE",
        }}
      >
        <button
          type="button"
          onClick={() => setBilling("annual")}
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "none",
            background: billing === "annual" ? "#6A55C9" : "transparent",
            color: billing === "annual" ? "#FFFDF9" : "#6E6076",
            fontWeight: 800,
            fontSize: "0.85rem",
            cursor: "pointer",
            fontFamily: "var(--v2-font-body)",
          }}
        >
          Annual (save 17%)
        </button>
        <button
          type="button"
          onClick={() => setBilling("monthly")}
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "none",
            background: billing === "monthly" ? "#6A55C9" : "transparent",
            color: billing === "monthly" ? "#FFFDF9" : "#6E6076",
            fontWeight: 800,
            fontSize: "0.85rem",
            cursor: "pointer",
            fontFamily: "var(--v2-font-body)",
          }}
        >
          Monthly
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {getR1VisiblePlans().map((tier) => (
          <TierCard key={tier.id} tier={tier} billing={billing} currentTier={currentTier} />
        ))}
      </div>

      <p style={{ color: "#9A8A78", fontSize: "0.82rem", textAlign: "center", marginTop: 8 }}>
        💛 Founding families get the first month free after the trial. Cancel
        anytime — your stories are yours to keep as PDFs.
      </p>
    </div>
  );
}
