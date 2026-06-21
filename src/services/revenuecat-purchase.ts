import type { RevenueCatPurchaseAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { Tier } from "@/domain/types";
import type { Entitlement } from "@/services/entitlement";
import { EntitlementService, TIER_ENTITLEMENTS } from "@/services/entitlement";
import type { SubscriptionService } from "@/services/subscription";

/**
 * RevenueCat Apple IAP + 7-day trial as VPC (issue 92 / ADR-0023 / ADR-0018).
 *
 * The entry point to the paid product: a **7-day free trial of Normal** that
 * requires a **card-on-file** — that card is the Verifiable Parental Consent
 * gate (ADR-0008 as updated). No child likeness (baby/Family-member photo
 * upload) is permitted without it. The trial/purchase maps to the server
 * entitlement model from issue 91.
 *
 * Entitlements are **cached** so a RevenueCat outage degrades gracefully: the
 * last-known tier is kept and the system retries on the next sync; the user is
 * never blocked or crashed because RevenueCat is down. The cache is the
 * subscription row itself — `SubscriptionService.isActive` reads it directly.
 *
 * No secrets: RevenueCat API keys are referenced by env-var name only
 * (`REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`); never committed.
 */
export interface TrialStartOptions {
  hasPaymentMethod: boolean;
}

export interface PurchaseOptions {
  hasPaymentMethod: boolean;
}

export interface SyncResult {
  entitlement: Entitlement;
  /** True when the sync fell back to the cached entitlement (RevenueCat unreachable). */
  degraded: boolean;
}

export class RevenueCatPurchaseService {
  private readonly cache = new Map<string, { tier: Tier; isTrial: boolean; syncedAt: Date }>();

  constructor(
    private readonly store: DataStore,
    private readonly subscriptions: SubscriptionService,
    private readonly revenuecat: RevenueCatPurchaseAdapter,
    private readonly entitlements?: EntitlementService
  ) {}

  /** Start the 7-day trial of the given tier (Normal default). Requires card-on-file = VPC. */
  async startTrial(familyId: string, tier: Tier = "normal", options: TrialStartOptions): Promise<void> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to start a trial (VPC gate — ADR-0008)");
    }
    const result = await this.revenuecat.startTrial(familyId, tier, { hasPaymentMethod: true });
    this.applyEntitlement(familyId, tier, result.isTrial);
  }

  /** Direct purchase (non-trial) of a tier. */
  async purchase(familyId: string, tier: Tier, options: PurchaseOptions): Promise<void> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to purchase");
    }
    const result = await this.revenuecat.purchase(familyId, tier, { hasPaymentMethod: true });
    this.applyEntitlement(familyId, tier, result.isTrial);
  }

  /**
   * Sync the current entitlement from RevenueCat. On outage, falls back to the
   * cached entitlement (the subscription row) and returns `degraded: true`.
   */
  async syncEntitlement(familyId: string): Promise<SyncResult> {
    const remote = await this.revenuecat.fetchEntitlement(familyId);
    if (remote) {
      const tier = remote.tier as Tier;
      this.applyEntitlement(familyId, tier, remote.isTrial);
      return {
        entitlement: this.getEntitlement(familyId),
        degraded: false,
      };
    }
    return {
      entitlement: this.getEntitlement(familyId),
      degraded: true,
    };
  }

  private applyEntitlement(familyId: string, tier: Tier, isTrial: boolean): void {
    const existing = this.store.getSubscription(familyId);
    this.store.saveSubscription({
      familyId,
      status: "active",
      stripeCustomerId: existing?.stripeCustomerId ?? null,
      stripeSubscriptionId: existing?.stripeSubscriptionId ?? `rc_${familyId}`,
      tier,
      updatedAt: new Date(),
    });
    this.cache.set(familyId, { tier, isTrial, syncedAt: new Date() });
  }

  private getEntitlement(familyId: string): Entitlement {
    if (this.entitlements) {
      return this.entitlements.getEntitlement(familyId);
    }
    const sub = this.store.getSubscription(familyId);
    if (!sub || sub.status !== "active") {
      return {
        tier: "basic" as Tier,
        storyCap: 0,
        memberCap: 0,
        canNarrate: false,
        canVideo: false,
        canCustomStyle: false,
      };
    }
    const tier = (sub.tier ?? "normal") as Tier;
    return TIER_ENTITLEMENTS[tier];
  }
}
