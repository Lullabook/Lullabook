import type {
  RevenueCatEntitlementEvidence,
  RevenueCatPurchaseAdapter,
  RevenueCatPurchaseResult,
} from "@/adapters/types";
import { optionalEnv } from "@/adapters/env";

/**
 * Real RevenueCat purchase adapter (issue 92).
 *
 * Communicates with RevenueCat's REST API for IAP purchase/trial and
 * entitlement sync. API keys are referenced by env-var name only — never
 * logged, never committed.
 *
 * The native SDK owns the Apple transaction. This server adapter never invents
 * a successful purchase: native callers wait for the signed RevenueCat webhook,
 * while this adapter is only used for server-side reconciliation.
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
    return this.unresolvedNativePurchase(tier, true);
  }

  async purchase(
    familyId: string,
    tier: string,
    options: { hasPaymentMethod: boolean }
  ): Promise<RevenueCatPurchaseResult> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to purchase");
    }
    return this.unresolvedNativePurchase(tier, false);
  }

  async fetchEntitlement(familyId: string): Promise<RevenueCatEntitlementEvidence | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(familyId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as {
        subscriber?: {
          entitlements?: Record<string, {
            product_id?: string;
            product_identifier?: string;
            period_type?: string;
            expires_date?: string | null;
          }>;
        };
      };
      const first = Object.values(data.subscriber?.entitlements ?? {})[0];
      if (!first) return null;
      const productId = first.product_id ?? first.product_identifier;
      return {
        tier: productId?.replace(/^lullabook[_-]/i, "") ?? "unknown",
        productId,
        isTrial: first.period_type?.toLowerCase() === "trial",
        verified: true,
        expirationAtMs: first.expires_date ? Date.parse(first.expires_date) : undefined,
      };
    } catch {
      return null;
    }
  }

  async restorePurchases(familyId: string): Promise<RevenueCatEntitlementEvidence | null> {
    return this.fetchEntitlement(familyId);
  }

  private unresolvedNativePurchase(tier: string, isTrial: boolean): RevenueCatPurchaseResult {
    // Server-side RevenueCat REST has no authority to perform an Apple purchase.
    // The native SDK must emit a webhook before this transaction can unlock.
    void tier;
    return { entitlementId: "", isTrial, verified: false };
  }
}
