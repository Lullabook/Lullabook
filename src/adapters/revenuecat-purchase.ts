import type {
  RevenueCatEntitlementEvidence,
  RevenueCatPurchaseAdapter,
  RevenueCatPurchaseResult,
} from "@/adapters/types";
import { optionalEnv } from "@/adapters/env";
import { r1TierFromRevenueCatProduct } from "@/domain/plan";

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
const REVENUECAT_READ_TIMEOUT_MS = 10_000;

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVENUECAT_READ_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(familyId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
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
      const now = Date.now();
      const active = Object.values(data.subscriber?.entitlements ?? {})
        .map((entitlement) => ({
          entitlement,
          productId: entitlement.product_id ?? entitlement.product_identifier,
          expirationAtMs: entitlement.expires_date ? Date.parse(entitlement.expires_date) : undefined,
        }))
        .find(({ productId, expirationAtMs }) =>
          !!r1TierFromRevenueCatProduct(productId) &&
          (expirationAtMs === undefined || (Number.isFinite(expirationAtMs) && expirationAtMs > now))
        );
      if (!active?.productId) return null;
      return {
        tier: "normal",
        productId: active.productId,
        isTrial: active.entitlement.period_type?.toLowerCase() === "trial",
        verified: true,
        expirationAtMs: active.expirationAtMs,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
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
