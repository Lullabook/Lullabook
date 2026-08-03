import { createHash } from "node:crypto";
import type {
  RevenueCatEntitlementEvidence,
  RevenueCatLifecycleEvent,
  RevenueCatPurchaseAdapter,
  RevenueCatPurchaseResult,
} from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { Tier } from "@/domain/types";
import { PLAN_ENTITLEMENTS, EntitlementService, type Entitlement } from "@/services/entitlement";
import { R1_PLAN_DEFINITION, r1TierFromRevenueCatProduct } from "@/domain/plan";
import type { SubscriptionService } from "@/services/subscription";

export interface TrialStartOptions {
  hasPaymentMethod: boolean;
}

export interface PurchaseOptions {
  hasPaymentMethod: boolean;
}

export interface SyncResult {
  entitlement: Entitlement;
  /** True when RevenueCat did not provide verified evidence. */
  degraded: boolean;
}

export interface RevenueCatWebhookResult {
  ok: boolean;
  duplicate: boolean;
  action?: "activated" | "deactivated" | "ignored";
  error?: string;
}

const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "RESTORE",
]);
const INACTIVE_EVENTS = new Set(["CANCELLATION", "EXPIRATION", "BILLING_ISSUE", "REFUND"]);
const KNOWN_EVENTS = new Set([...ACTIVE_EVENTS, ...INACTIVE_EVENTS]);

function isTier(value: string | undefined): value is Tier {
  return value === "basic" || value === "normal" || value === "plus";
}

function evidenceTier(evidence: RevenueCatEntitlementEvidence): Tier | undefined {
  const productTier = r1TierFromRevenueCatProduct(evidence.productId);
  if (evidence.productId && !productTier) return undefined;
  if (productTier) return productTier;
  return isTier(evidence.tier) ? evidence.tier : undefined;
}

function purchaseIsResolved(result: RevenueCatPurchaseResult): boolean {
  const verified = result.verified === true ||
    (result.verified === undefined && process.env.NODE_ENV !== "production");
  return Boolean(result.entitlementId && verified);
}

/**
 * Server RevenueCat seam. Native transactions are evidence producers; this
 * service is the only code allowed to turn verified evidence into entitlement.
 * Webhook receipts use the already hydrated Family context and are persisted by
 * the caller's single `ctx.persist()`.
 */
export class RevenueCatPurchaseService {
  constructor(
    private readonly store: DataStore,
    private readonly subscriptions: SubscriptionService,
    private readonly revenuecat: RevenueCatPurchaseAdapter,
    private readonly entitlements?: EntitlementService
  ) {}

  async startTrial(familyId: string, tier: Tier = "normal", options: TrialStartOptions): Promise<void> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to start a trial (VPC gate — ADR-0008)");
    }
    const result = await this.revenuecat.startTrial(familyId, tier, { hasPaymentMethod: true });
    this.applyPurchaseEvidence(familyId, tier, result);
  }

  async purchase(familyId: string, tier: Tier, options: PurchaseOptions): Promise<void> {
    if (!options.hasPaymentMethod) {
      throw new Error("A payment method is required to purchase");
    }
    const result = await this.revenuecat.purchase(familyId, tier, { hasPaymentMethod: true });
    this.applyPurchaseEvidence(familyId, tier, result);
  }

  /** Reconcile a server-side entitlement read from RevenueCat. */
  async syncEntitlement(familyId: string): Promise<SyncResult> {
    return this.applyRemoteEvidence(familyId, await this.revenuecat.fetchEntitlement(familyId));
  }

  /** Restore is explicit; a missing native restore method falls back to a read. */
  async restorePurchases(familyId: string): Promise<SyncResult> {
    const evidence = this.revenuecat.restorePurchases
      ? await this.revenuecat.restorePurchases(familyId)
      : await this.revenuecat.fetchEntitlement(familyId);
    return this.applyRemoteEvidence(familyId, evidence);
  }

  /**
   * Apply one normalized, already signature-verified RevenueCat lifecycle event.
   * Event receipts live in the hydrated Family audit inventory, so replaying an
   * event is a no-op after the request context is persisted.
   */
  handleWebhookEvent(event: RevenueCatLifecycleEvent): RevenueCatWebhookResult {
    const familyId = this.resolveFamilyId(event.appUserId);
    if (!familyId) {
      return { ok: false, duplicate: false, error: "RevenueCat app_user_id is not bound to a Family" };
    }
    if (typeof event.eventId !== "string" || !event.eventId.trim() || typeof event.type !== "string" || !event.type.trim()) {
      return { ok: false, duplicate: false, error: "RevenueCat event id and type are required" };
    }

    const eventType = event.type.toUpperCase();
    if ([...this.store.moderationAudit.values()].some(
      (receipt) =>
        receipt.familyId === familyId &&
        receipt.resourceType === "revenuecat_lifecycle" &&
        receipt.resourceId === event.eventId
    )) {
      return { ok: true, duplicate: true };
    }

    const outOfOrder = this.isOlderThanRecordedEvent(familyId, event.eventTimestampMs);
    const tier = this.lifecycleTier(event);
    const known = KNOWN_EVENTS.has(eventType);
    const action = !known || outOfOrder || (ACTIVE_EVENTS.has(eventType) && !tier)
      ? "ignored"
      : ACTIVE_EVENTS.has(eventType)
        ? "activated"
        : "deactivated";

    const receiptId = this.receiptId(familyId, event.eventId);
    this.store.moderationAudit.set(receiptId, {
      id: receiptId,
      familyId,
      resourceType: "revenuecat_lifecycle",
      resourceId: event.eventId,
      outcome: action === "ignored" ? "blocked" : "allowed",
      reason: `${eventType}:${event.eventTimestampMs ?? ""}`,
      createdAt: new Date(),
    });

    if (action === "ignored") return { ok: true, duplicate: false, action };

    if (action === "activated") {
      this.subscriptions.handleRevenueCatActivated(
        familyId,
        event.subscriptionId ?? `rc_${event.eventId}`,
        tier!,
        {
          isTrial: event.isTrial === true,
          expirationAtMs: event.expirationAtMs,
        }
      );
    } else {
      this.subscriptions.handleRevenueCatInactive(
        familyId,
        event.subscriptionId,
        eventType === "BILLING_ISSUE" ? "past_due" : "canceled"
      );
    }
    return { ok: true, duplicate: false, action };
  }

  private applyPurchaseEvidence(
    familyId: string,
    tier: Tier,
    result: RevenueCatPurchaseResult
  ): void {
    if (!purchaseIsResolved(result)) {
      throw new UnresolvedRevenueCatPurchaseError();
    }
    this.subscriptions.handleRevenueCatActivated(
      familyId,
      result.subscriptionId ?? result.entitlementId,
      tier,
      { isTrial: result.isTrial, expirationAtMs: result.expirationAtMs }
    );
  }

  private async applyRemoteEvidence(
    familyId: string,
    evidence: RevenueCatEntitlementEvidence | null
  ): Promise<SyncResult> {
    const tier = evidence ? evidenceTier(evidence) : undefined;
    const verified = evidence?.verified === true ||
      (evidence?.verified === undefined && process.env.NODE_ENV !== "production");
    if (evidence && tier && verified) {
      this.subscriptions.handleRevenueCatActivated(
        familyId,
        evidence.subscriptionId ?? `rc_${familyId}`,
        tier,
        { isTrial: evidence.isTrial, expirationAtMs: evidence.expirationAtMs }
      );
      return { entitlement: this.getEntitlement(familyId), degraded: false };
    }
    return { entitlement: this.getEntitlement(familyId), degraded: true };
  }

  private lifecycleTier(event: RevenueCatLifecycleEvent): Tier | undefined {
    const productTier = r1TierFromRevenueCatProduct(event.productId);
    if (event.productId && !productTier) return undefined;
    if (productTier) return productTier;
    return isTier(event.tier) ? event.tier : "normal";
  }

  private resolveFamilyId(appUserId: string): string | undefined {
    if (this.store.familyDataExists(appUserId)) return appUserId;
    return this.store.getMemberByAuthUserId(appUserId)?.familyId;
  }

  private receiptId(familyId: string, eventId: string): string {
    const hex = createHash("sha256")
      .update(`${familyId}:${eventId}`)
      .digest("hex")
      .slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
  }

  private isOlderThanRecordedEvent(familyId: string, timestampMs?: number): boolean {
    if (timestampMs === undefined) return false;
    let newest = -Infinity;
    for (const entry of this.store.moderationAudit.values()) {
      if (entry.familyId !== familyId || entry.resourceType !== "revenuecat_lifecycle") continue;
      const rawTimestamp = entry.reason?.split(":").at(-1);
      if (!rawTimestamp) continue;
      const recorded = Number(rawTimestamp);
      if (Number.isFinite(recorded)) newest = Math.max(newest, recorded);
    }
    return newest !== -Infinity && timestampMs < newest;
  }

  private getEntitlement(familyId: string): Entitlement {
    if (this.entitlements) return this.entitlements.getEntitlement(familyId);
    const sub = this.store.getSubscription(familyId);
    if (!sub || sub.status !== "active") return {
      tier: "basic",
      storyCap: 0,
      memberCap: 0,
      canNarrate: false,
      canVideo: false,
      canCustomStyle: false,
    };
    return sub.tier === "plus" ? PLAN_ENTITLEMENTS.our_whole_family : {
      ...PLAN_ENTITLEMENTS.just_us,
      storyCap: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
      memberCap: R1_PLAN_DEFINITION.limits.personas,
    };
  }
}

export class UnresolvedRevenueCatPurchaseError extends Error {
  readonly code = "revenuecat_purchase_unresolved";
  constructor() {
    super("RevenueCat has not verified the purchase yet");
    this.name = "UnresolvedRevenueCatPurchaseError";
  }
}
