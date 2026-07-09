import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";
import { tierToPlan } from "@/services/entitlement";
import { TrialAlreadyUsedError } from "@/services/subscription";

/**
 * Issue 168 — Subscription trial model (`trialEndsAt`) + `activateTrial`.
 * PRD v20 Pillar A root / ADR-0027 (D7).
 *
 * - A trial is `status: "active"` WITH `trialEndsAt = now + 7d` — no new status.
 * - SEC-4 (fail closed): `isActive` is false past `trialEndsAt`; non-trial
 *   active subs (null/absent `trialEndsAt`) are unaffected.
 * - `activateTrial` writes the same shape the RevenueCat webhook writes,
 *   idempotently (replay does not extend or duplicate).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function newGuardian(ctx: ReturnType<typeof createTestContext>) {
  return ctx.onboarding.ensureFamilyForNewUser("guardian", "trial@example.com");
}

describe("168 — Subscription trial model + activateTrial", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("activateTrial", () => {
    it("writes an active Just-Us trial with trialEndsAt = now + 7d (webhook shape)", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);

      const sub = ctx.subscriptions.activateTrial(guardian.familyId);

      expect(sub.status).toBe("active");
      expect(sub.familyId).toBe(guardian.familyId);
      expect(sub.trialEndsAt).toEqual(new Date(Date.now() + 7 * DAY_MS));
      // R1 = Just Us; legacy tier maps forward via tierToPlan.
      expect(tierToPlan(sub.tier)).toBe("just_us");
      // Same shape the RevenueCat webhook writes — a subscription id is present.
      expect(sub.stripeSubscriptionId).toBeTruthy();
      // Persisted as the single subscription row for the Household.
      expect(ctx.store.getSubscription(guardian.familyId)).toEqual(sub);
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    });

    it("is idempotent — a second call does not extend or duplicate", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);

      const first = ctx.subscriptions.activateTrial(guardian.familyId);
      vi.advanceTimersByTime(2 * DAY_MS); // replay later in the trial
      const second = ctx.subscriptions.activateTrial(guardian.familyId);

      expect(second.trialEndsAt).toEqual(first.trialEndsAt);
      expect(ctx.store.subscriptions.size).toBe(1);
    });

    it("audit fix: refuses a second trial after the first expired (one trial per family ever)", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.activateTrial(guardian.familyId);

      vi.advanceTimersByTime(8 * DAY_MS); // trial lapsed
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);

      let err: unknown;
      try {
        ctx.subscriptions.activateTrial(guardian.familyId);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(TrialAlreadyUsedError);
      expect((err as TrialAlreadyUsedError).status).toBe(403);
      expect((err as TrialAlreadyUsedError).code).toBe("trial_already_used");
      // Fail closed: nothing re-minted, Household still inactive.
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    });

    it("audit fix: refuses a re-trial after cancel of a trial sub", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.activateTrial(guardian.familyId);
      ctx.subscriptions.cancel(guardian.familyId);

      expect(() => ctx.subscriptions.activateTrial(guardian.familyId)).toThrow(
        TrialAlreadyUsedError,
      );
    });

    it("does not clobber an existing non-trial active subscription", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_x", "sub_x");

      const sub = ctx.subscriptions.activateTrial(guardian.familyId);

      expect(sub.stripeSubscriptionId).toBe("sub_x");
      expect(sub.trialEndsAt ?? null).toBeNull(); // stays a real sub, not demoted to a trial
      expect(ctx.store.subscriptions.size).toBe(1);
    });
  });

  describe("isActive with trialEndsAt (SEC-4 fail closed)", () => {
    it("true during the trial window", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.activateTrial(guardian.familyId);

      vi.advanceTimersByTime(6 * DAY_MS);
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    });

    it("false past trialEndsAt — Household re-hits the paywall", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.activateTrial(guardian.familyId);

      vi.advanceTimersByTime(7 * DAY_MS + 1);
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    });

    it("exactly at trialEndsAt is expired (now < trialEndsAt is the contract)", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.activateTrial(guardian.familyId);

      vi.advanceTimersByTime(7 * DAY_MS);
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    });

    it("non-trial active sub (absent trialEndsAt) still reads active", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_x", "sub_x");

      vi.advanceTimersByTime(365 * DAY_MS);
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    });

    it("explicit null trialEndsAt on an active sub still reads active", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.store.saveSubscription({
        familyId: guardian.familyId,
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: "sub_null_trial",
        trialEndsAt: null,
        updatedAt: new Date(),
      });

      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    });

    it("expired trial with canceled/none status stays inactive (no resurrection)", () => {
      const ctx = createTestContext();
      const guardian = newGuardian(ctx);
      ctx.store.saveSubscription({
        familyId: guardian.familyId,
        status: "canceled",
        stripeCustomerId: null,
        stripeSubscriptionId: "sub_c",
        trialEndsAt: new Date(Date.now() + 7 * DAY_MS),
        updatedAt: new Date(),
      });

      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    });
  });
});
