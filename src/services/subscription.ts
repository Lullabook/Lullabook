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

    // Audit fix (MAJOR): "one trial per family EVER". A non-live sub that
    // ever carried a trialEndsAt means the trial was already granted and
    // lapsed (expired or canceled) — re-minting here would hand out serial
    // free weeks. 403 domain error; the client routes it to the real paywall.
    if (existing?.trialEndsAt != null) {
      throw new TrialAlreadyUsedError();
    }

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
    jurisdiction: string,
    method?: string
  ): ConsentReceipt {
    const config = ConsentEngine.getJurisdiction(jurisdiction);
    if (!config) throw new Error("Unknown jurisdiction");
    const receipt: ConsentReceipt = {
      id: uuid(),
      familyId,
      memberId,
      jurisdiction,
      noticeVersion: config.noticeVersion,
      // Issue 172 (SEC-3): receipts record HOW consent was obtained. Payment
      // paths must pin "payment_vpc" explicitly — the default is only correct
      // for flows that actually completed the jurisdiction's required method.
      method: method ?? config.consentMethod,
      consentedAt: new Date(),
    };
    this.store.saveConsentReceipt(receipt);
    return receipt;
  }

  /**
   * Issue 172 — method-aware consent. A receipt only satisfies the
   * jurisdiction when it was obtained via the REQUIRED method: payment must
   * not satisfy consent and consent must not satisfy payment (ADR-0018).
   * Legacy receipts without a method are treated as payment_vpc, so they
   * fail closed in email_plus / signed_form markets.
   */
  private consentSatisfied(familyId: string, jurisdiction: string): boolean {
    const config = ConsentEngine.getJurisdiction(jurisdiction);
    if (!config) return false;
    // Red-team fix: select the receipt whose method MATCHES the required one
    // (families can hold payment_vpc + email_plus receipts side-by-side).
    return !!this.store.getConsentReceiptForFamily(familyId, config.consentMethod);
  }

  /** Issue 172 (SEC-4): throws a structured 403; consent-store read errors deny. */
  requireConsentVerified(familyId: string): void {
    let ok = false;
    try {
      const guardian = this.store
        .getMembersByFamily(familyId)
        .find((m) => m.role === "guardian");
      ok = guardian ? this.consentSatisfied(familyId, guardian.jurisdiction) : false;
    } catch {
      ok = false; // fail closed — a read error must never mint consent
    }
    if (!ok) throw new ConsentRequiredError();
  }

  canCreateBabyPersona(memberId: string): {
    allowed: boolean;
    reason?: string;
    code?: "consent_required";
  } {
    const member = this.store.members.get(memberId);
    if (!member) return { allowed: false, reason: "Member not found" };
    let hasVerifiedConsent = false;
    try {
      hasVerifiedConsent = this.consentSatisfied(member.familyId, member.jurisdiction);
    } catch {
      // SEC-4: consent store unreadable — deny, never allow.
      return {
        allowed: false,
        code: "consent_required",
        reason: "Consent verification is temporarily unavailable",
      };
    }
    const result = this.consentEngine.check({
      jurisdiction: member.jurisdiction,
      actorRole: member.role,
      action: "create_baby_persona",
      hasActiveSubscription: this.isActive(member.familyId),
      hasConsentReceipt: hasVerifiedConsent,
    });
    return {
      allowed: result.allowed,
      reason: result.reason,
      // Red-team fix: machine code from the engine, not reason-string
      // sniffing — copy edits must never silently drop the typed 403.
      code: !result.allowed && result.code === "consent_required" ? "consent_required" : undefined,
    };
  }
}

/**
 * 403 raised when a family's one-and-only trial was already used (issue 168,
 * ADR-0027). Machine code so mobile routes straight to the purchase paywall.
 */
export class TrialAlreadyUsedError extends Error {
  readonly status = 403;
  readonly code = "trial_already_used";
  constructor(
    message = "Your family's free trial has already been used — choose a plan to continue"
  ) {
    super(message);
    this.name = "TrialAlreadyUsedError";
  }
}

/** 403 raised when verified parental consent is missing (issue 172, ADR-0018). */
export class ConsentRequiredError extends Error {
  readonly status = 403;
  readonly code = "consent_required";
  constructor(
    message = "Verified parental consent is required before creating a baby profile"
  ) {
    super(message);
    this.name = "ConsentRequiredError";
  }
}
