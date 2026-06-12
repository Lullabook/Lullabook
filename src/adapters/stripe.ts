import Stripe from "stripe";
import type { StripeAdapter, StripeCheckoutSession } from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!client) {
    client = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return client;
}

/**
 * Real Stripe adapter (ADR-0009). The checkout session carries the familyId
 * in metadata so the webhook can activate the right Subscription row — and
 * the completed card transaction doubles as verifiable parental consent
 * (payment-VPC, ADR-0008).
 */
export class RealStripeAdapter implements StripeAdapter {
  async createCheckoutSession(familyId: string): Promise<StripeCheckoutSession> {
    const stripe = getStripeClient();
    const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
      success_url: `${appUrl}/billing?status=success`,
      cancel_url: `${appUrl}/billing?status=canceled`,
      metadata: { familyId },
      subscription_data: { metadata: { familyId } },
    });
    if (!session.url) throw new Error("Stripe checkout session has no URL");
    return { id: session.id, url: session.url };
  }

  async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    await getStripeClient().subscriptions.cancel(stripeSubscriptionId);
  }
}
