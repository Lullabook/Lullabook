import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { cancelSubscriptionFormAction, startCheckoutFormAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

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

  return (
    <>
      <p className="eyebrow">Subscription</p>
      <h1>Billing</h1>

      {status === "success" && (
        <div className="alert alert-info">
          Welcome aboard! Your subscription is activating — this page updates
          as soon as Stripe confirms the payment.
        </div>
      )}
      {status === "canceled" && (
        <div className="alert alert-warning">Checkout canceled — no charge was made.</div>
      )}

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Lullabook subscription</h2>
          <span className={`badge badge-${active ? "active" : sub?.status === "canceled" ? "canceled" : "pending"}`}>
            {sub?.status ?? "none"}
          </span>
        </div>
        <ul className="muted" style={{ lineHeight: 2 }}>
          <li>Unlimited illustrated Storybooks (fair use)</li>
          <li>Up to 5 trained Personas — babies and grown-ups</li>
          <li>Your card payment doubles as verifiable parental consent</li>
          <li>Cancel anytime: 30 days to export everything, then we purge it all</li>
        </ul>

        {active ? (
          <form action={cancelSubscriptionFormAction}>
            <SubmitButton className="btn btn-danger" label="Cancel subscription" pendingLabel="Canceling…" />
            <p className="subtle" style={{ marginTop: 12, marginBottom: 0 }}>
              Canceling starts a 30-day export window. Download your books as
              PDFs; after the window, photos, models, and books are purged.
            </p>
          </form>
        ) : (
          <form action={startCheckoutFormAction}>
            <SubmitButton className="btn btn-primary" label="Subscribe with Stripe" pendingLabel="Redirecting…" />
          </form>
        )}
      </div>

      {purge && (
        <div className="alert alert-warning">
          Export window open: everything will be permanently purged on{" "}
          <strong>{purge.purgeAt.toLocaleDateString()}</strong>. Download your
          finalized books from the library before then.
        </div>
      )}

      {sub?.status === "canceled" && !active && (
        <div className="card">
          <h2>Changed your mind?</h2>
          <form action={startCheckoutFormAction}>
            <SubmitButton className="btn btn-primary" label="Resubscribe" pendingLabel="Redirecting…" />
          </form>
        </div>
      )}
    </>
  );
}
