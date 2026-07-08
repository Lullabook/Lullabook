import { v4 as uuid } from "uuid";
import type { StripeAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { ConsentReceipt, Plan, Subscription, Tier } from "@/domain/types";
import { ConsentEngine } from "@/services/consent-engine";

/** 7-day trial window (ADR-0027 / issue 168). */
const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Inverse of `tierToPlan` for the trial write (legacy tier field maps forward). */
function planToTier(plan: Plan): Tier {
  return plan === "our_whole_family" ? "plus" : "normal";
}

/**
 * Trial-aware activity check (issue 168, SEC-4 fail closed): a subscription is
 * live only when `active` AND (no `trialEndsAt` OR strictly before it). A
 * trial past `trialEndsAt` reads inactive — the Household re-hits the paywall.
 */
function subscriptionIsLive(sub: Subscription | undefined, now: Date): boolean {
  if (sub?.status !== "active") return false;
  if (sub.trialEndsAt === undefined || sub.trialEndsAt === null) return true;
  return now.getTime() < sub.trialEndsAt.getTime();
}

function devForcedSubscription(): "active" | "inactive" | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const value = process.env.DEV_FORCE_SUBSCRIPTION;
  if (value === "active") return "active";
  if (value === "inactive") return "inactive";
  return undefined;
}

export class SubscriptionService {
  private readonly consentEngine = new ConsentEngine();

  constructor(
    private readonly store: DataStore,
    private readonly stripe: StripeAdapter
  ) {}

  async startCheckout(familyId: string) {
    return this.stripe.createCheckoutSession(familyId);
  }

  handleCheckoutCompleted(familyId: string, stripeCustomerId: string, stripeSubscriptionId: string) {
    this.store.saveSubscription({
      familyId,
      status: "active",
      stripeCustomerId,
      stripeSubscriptionId,
      // Real purchase converts/overrides any trial — clear the window (issue 168).
      trialEndsAt: null,
      updatedAt: new Date(),
    });
  }

  handleRevenueCatActivated(familyId: string, revenueCatSubscriptionId: string) {
    const existing = this.store.getSubscription(familyId);
    this.store.saveSubscription({
      familyId,
      status: "active",
      stripeCustomerId: existing?.stripeCustomerId ?? null,
      stripeSubscriptionId: existing?.stripeSubscriptionId ?? revenueCatSubscriptionId,
      // Real purchase converts/overrides any trial — clear the window (issue 168).
      trialEndsAt: null,
      updatedAt: new Date(),
    });
  }

  cancel(familyId: string) {
    const sub = this.store.getSubscription(familyId);
    if (!sub?.stripeSubscriptionId) throw new Error("No subscription");
    this.store.saveSubscription({
      ...sub,
      status: "canceled",
      updatedAt: new Date(),
    });
    const purgeAt = new Date();
    purgeAt.setDate(purgeAt.getDate() + 30);
    this.store.purgeScheduled.set(familyId, { familyId, purgeAt });
  }

  isActive(familyId: string): boolean {
    const forced = devForcedSubscription();
    if (forced !== undefined) return forced === "active";
    return subscriptionIsLive(this.store.getSubscription(familyId), new Date());
  }

  /**
   * Issue 168 (ADR-0027) — activate the 7-day trial, writing the SAME
   * subscription shape the RevenueCat webhook writes (status `active`, Just-Us
   * tier via the legacy field, `trialEndsAt = now + 7d`). Idempotent: a call
   * for a Household whose subscription is already live returns it unchanged —
   * never extends, never duplicates, never demotes a real (non-trial) sub.
   * Single-row read + write (PERF-1). Both the fake start-trial endpoint (169)
   * and the real webhook converge on this state.
   */
  activateTrial(familyId: string, plan: Plan = "just_us"): Subscription {
    const now = new Date();
    const existing = this.store.getSubscription(familyId);
    if (subscriptionIsLive(existing, now)) return existing as Subscription;

    const sub: Subscription = {
      familyId,
      status: "active",
      stripeCustomerId: existing?.stripeCustomerId ?? null,
      stripeSubscriptionId: existing?.stripeSubscriptionId ?? `rc_trial_${familyId}`,
      tier: planToTier(plan),
      trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
      updatedAt: now,
    };
    this.store.saveSubscription(sub);
    return sub;
  }

  recordConsent(
    familyId: string,
    memberId: string,
    jurisdiction: string
  ): ConsentReceipt {
    const config = ConsentEngine.getJurisdiction(jurisdiction);
    if (!config) throw new Error("Unknown jurisdiction");
    const receipt: ConsentReceipt = {
      id: uuid(),
      familyId,
      memberId,
      jurisdiction,
      noticeVersion: config.noticeVersion,
      consentedAt: new Date(),
    };
    this.store.saveConsentReceipt(receipt);
    return receipt;
  }

  canCreateBabyPersona(memberId: string): { allowed: boolean; reason?: string } {
    const member = this.store.members.get(memberId);
    if (!member) return { allowed: false, reason: "Member not found" };
    const result = this.consentEngine.check({
      jurisdiction: member.jurisdiction,
      actorRole: member.role,
      action: "create_baby_persona",
      hasActiveSubscription: this.isActive(member.familyId),
      hasConsentReceipt: !!this.store.getConsentReceiptForFamily(member.familyId),
    });
    return { allowed: result.allowed, reason: result.reason };
  }
}
