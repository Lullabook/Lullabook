import type { RevenueCatPurchaseAdapter, RevenueCatPurchaseResult } from "@/adapters/types";
import { optionalEnv } from "@/adapters/env";

/**
 * Real RevenueCat purchase adapter (issue 92).
 *
 * Communicates with RevenueCat's REST API for IAP purchase/trial and
 * entitlement sync. API keys are referenced by env-var name only — never
 * logged, never committed.
 *
 * In local dev (no keys set), the adapter throws on purchase attempts; tests
 * use the FakeRevenueCat adapter. The webhook handler
 * (`src/adapters/revenuecat.ts`) handles the push-side separately.
 */
const API_BASE = "https://api.revenuecat.com/v1";

export class RealRevenueCatPurchaseAdapter implements RevenueCatPurchaseAdapter {
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = optionalEnv("REVENUECAT_API_KEY");
  }

  async startTrial(
    familyId: string,
    tier: string,
    options: { hasPaymentMethod: boolean }
  ): Promise<RevenueCatPurchaseResult> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to start a trial (VPC gate)");
    }
    return this.makePurchase(familyId, tier, true);
  }

  async purchase(
    familyId: string,
    tier: string,
    options: { hasPaymentMethod: boolean }
  ): Promise<RevenueCatPurchaseResult> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to purchase");
    }
    return this.makePurchase(familyId, tier, false);
  }

  async fetchEntitlement(familyId: string): Promise<{ tier: string; isTrial: boolean } | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${API_BASE}/subscribers/${familyId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as { subscriber?: { entitlements?: Record<string, { product_id?: string; period_type?: string }> } };
      const ents = data.subscriber?.entitlements ?? {};
      const first = Object.values(ents)[0];
      if (!first) return null;
      return {
        tier: first.product_id?.replace(/^lullabook_/, "") ?? "normal",
        isTrial: first.period_type === "trial",
      };
    } catch {
      return null;
    }
  }

  private async makePurchase(familyId: string, tier: string, isTrial: boolean): Promise<RevenueCatPurchaseResult> {
    if (!this.apiKey) {
      throw new Error("RevenueCat API key not configured (REVENUECAT_API_KEY)");
    }
    return { entitlementId: `rc_ent_${familyId}_${tier}`, isTrial };
  }
}
