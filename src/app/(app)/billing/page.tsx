import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { cancelSubscriptionFormAction, startCheckoutFormAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { PaywallUI } from "@/components/v2/paywall-ui";
import { getTierBadge } from "@/lib/paywall-config";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { ctx, member } = await requireAuthedContext();
  const sub = ctx.store.getSubscription(member.familyId);
  const active = sub?.status === "active";
  const purge = ctx.store.purgeScheduled.get(member.familyId);
  const currentTier = active ? (sub?.tier ?? "normal") : undefined;
  const badge = currentTier ? getTierBadge(currentTier) : null;

  const cardStyle = {
    background: "#FFFDF9",
    border: "1px solid #ECE1CE",
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
  } as const;

  return (
    <div className="v2-stack" style={{ gap: 18 }}>
      <div>
        <p className="v2-eyebrow">✨ Subscription</p>
        <h1 className="v2-page-title">Billing</h1>
      </div>

      {status === "success" && (
        <div className="v2-notice" style={{ background: "#EDE7FE", borderColor: "#d6cbf6", color: "#6A55C9" }}>
          Welcome aboard! Your subscription is activating — this page updates as
          soon as Stripe confirms the payment.
        </div>
      )}
      {status === "canceled" && (
        <div className="v2-notice">Checkout canceled — no charge was made.</div>
      )}

      {active && badge && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.3rem", color: "#2E2438" }}>
              Your plan: {badge.label}
            </h2>
            <span
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                background: "#E1F1E8",
                color: "#3E7A5A",
                fontWeight: 800,
                fontSize: "0.78rem",
              }}
            >
              Active
            </span>
          </div>
          <form action={cancelSubscriptionFormAction} style={{ marginTop: 16 }}>
            <SubmitButton className="v2-btn v2-btn--danger-ghost" label="Cancel subscription" pendingLabel="Canceling…" />
            <p style={{ marginTop: 12, marginBottom: 0, color: "#9A8A78", fontSize: "0.85rem" }}>
              Canceling starts a 30-day export window. Download your books as
              PDFs; after the window, photos, models, and books are purged.
            </p>
          </form>
        </div>
      )}

      {!active && <PaywallUI currentTier={currentTier} />}

      {purge && (
        <div className="v2-notice">
          Export window open: everything will be permanently purged on{" "}
          <strong>{purge.purgeAt.toLocaleDateString()}</strong>. Download your
          finalized books from the library before then.
        </div>
      )}

      {sub?.status === "canceled" && !active && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 12px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem", color: "#2E2438" }}>
            Changed your mind?
          </h2>
          <form action={startCheckoutFormAction}>
            <SubmitButton className="v2-btn v2-btn--primary" label="Resubscribe" pendingLabel="Redirecting…" />
          </form>
        </div>
      )}
    </div>
  );
}
