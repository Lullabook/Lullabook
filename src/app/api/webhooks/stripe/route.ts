import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/adapters/env";
import { getStripeClient } from "@/adapters/stripe";
import { createRequestContext } from "@/lib/context";

/**
 * Stripe webhook: activates the Family's subscription on checkout completion
 * and — because the completed card transaction is the verifiable parental
 * consent signal (payment-VPC, ADR-0008) — records the consent receipt for
 * the Guardian in the same unit of work.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      await req.text(),
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const familyId = session.metadata?.familyId;
    if (!familyId) {
      return NextResponse.json({ error: "No familyId in metadata" }, { status: 400 });
    }
    const ctx = createRequestContext();
    await ctx.store.hydrateFamily(familyId);
    ctx.subscriptions.handleCheckoutCompleted(
      familyId,
      typeof session.customer === "string" ? session.customer : (session.customer?.id ?? ""),
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription?.id ?? "")
    );
    const guardian = [...ctx.store.members.values()].find(
      (m) => m.familyId === familyId && m.role === "guardian"
    );
    if (guardian) {
      // Issue 172: a payment-derived receipt is pinned to "payment_vpc". It
      // satisfies consent ONLY in payment_vpc jurisdictions — never email_plus
      // (US_IOS, ADR-0018) or signed_form markets.
      ctx.subscriptions.recordConsent(familyId, guardian.id, guardian.jurisdiction, "payment_vpc");
    }
    await ctx.persist();
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const familyId = subscription.metadata?.familyId;
    if (familyId) {
      const ctx = createRequestContext();
      await ctx.store.hydrateFamily(familyId);
      const sub = ctx.store.getSubscription(familyId);
      if (sub && sub.status === "active") {
        // Cancellation initiated on Stripe's side: schedule export-then-purge
        // exactly like an in-app cancel (ADR-0007).
        ctx.subscriptions.cancel(familyId);
        await ctx.persist();
      }
    }
  }

  return NextResponse.json({ received: true });
}
