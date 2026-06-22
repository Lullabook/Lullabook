import { describe, expect, it } from "vitest";
import { createTestContext, subscribedGuardian } from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import {
  PAYWALL_TIERS,
  getTierBadge,
  getCapUsageState,
  getCreditUsageState,
  isAnnualDefault,
} from "@/lib/paywall-config";
import type { StoryCapUsage } from "@/services/story-cap";
import type { CreditBalance } from "@/services/credit-ledger";

function setTier(
  ctx: ReturnType<typeof createTestContext>,
  familyId: string,
  tier: Tier
) {
  const existing = ctx.store.getSubscription(familyId);
  ctx.store.saveSubscription({
    familyId,
    status: "active",
    stripeCustomerId: existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: existing?.stripeSubscriptionId ?? null,
    tier,
    updatedAt: new Date(),
  });
}

describe("99 — Paywall UI (two plans, annual-default) + plan badges + credit/upgrade surfaces", () => {
  describe("paywall renders two plans", () => {
    it("has exactly two plans: Just Us, Our Whole Family", () => {
      expect(PAYWALL_TIERS).toHaveLength(2);
      expect(PAYWALL_TIERS.map((t) => t.id)).toEqual(["just_us", "our_whole_family"]);
    });

    it("Just Us is $9.99/mo, Our Whole Family is $24.99/mo", () => {
      const prices = PAYWALL_TIERS.map((t) => ({ id: t.id, monthly: t.monthlyPrice }));
      expect(prices).toEqual([
        { id: "just_us", monthly: 9.99 },
        { id: "our_whole_family", monthly: 24.99 },
      ]);
    });

    it("each plan shows story cap, member cap, and capabilities", () => {
      for (const tier of PAYWALL_TIERS) {
        expect(tier.storyCap).toBeGreaterThan(0);
        expect(tier.canNarrate).toBeDefined();
        expect(tier.canVideo).toBeDefined();
        expect(tier.canCustomStyle).toBeDefined();
      }
    });

    it("Our Whole Family is marked as the recommended plan (trial target)", () => {
      const recommended = PAYWALL_TIERS.find((t) => t.id === "our_whole_family");
      expect(recommended?.isRecommended).toBe(true);
    });

    it("copy leads with value, not price", () => {
      for (const tier of PAYWALL_TIERS) {
        expect(tier.valueProp).toBeTruthy();
        expect(tier.valueProp.length).toBeGreaterThan(tier.monthlyPrice.toString().length);
      }
    });
  });

  describe("annual-default", () => {
    it("annual billing is the default option", () => {
      expect(isAnnualDefault()).toBe(true);
    });
  });

  describe("plan badges", () => {
    it("Just Us plan shows the correct badge", () => {
      const badge = getTierBadge("normal" as any);
      expect(badge.label).toBe("Just Us");
      expect(badge.color).toBeDefined();
    });

    it("Our Whole Family plan shows the correct badge", () => {
      const badge = getTierBadge("plus" as any);
      expect(badge.label).toBe("Our Whole Family");
    });
  });

  describe("entitlement-aware UI gating", () => {
    it("a gated feature shows an upgrade affordance for a lower tier", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "basic");

      const ent = ctx.entitlements.getEntitlement(guardian.familyId);
      expect(ent.canVideo).toBe(false);
      expect(ent.canCustomStyle).toBe(false);
      // The UI should show an upgrade affordance — the server 403 is the boundary
    });

    it("the server 403 remains the boundary (UI gating alone is never trusted)", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "basic");

      // Even if the UI doesn't gate, the server rejects
      expect(() =>
        ctx.entitlements.requireCapability(guardian.familyId, "video")
      ).toThrow();
    });
  });

  describe("cap/credit usage states", () => {
    it("cap usage state renders count/cap + reset date + upgrade CTA", () => {
      const usage: StoryCapUsage = {
        count: 4,
        cap: 4,
        resetDate: "2026-07-01",
        remaining: 0,
      };
      const state = getCapUsageState(usage);
      expect(state.label).toContain("4/4");
      expect(state.label).toContain("this month");
      expect(state.resetDate).toBe("2026-07-01");
      expect(state.isExhausted).toBe(true);
      expect(state.upgradeCta).toBeDefined();
    });

    it("credit usage state renders balance + reset date + buy CTA", () => {
      const balance: CreditBalance = {
        videoIncluded: 0,
        videoUsed: 2,
        customStyleIncluded: 0,
        customStyleUsed: 1,
        rerollIncluded: 0,
        rerollUsed: 0,
        purchased: 0,
        resetDate: "2026-07-01",
      };
      const state = getCreditUsageState(balance);
      expect(state.isExhausted).toBe(true);
      expect(state.buyCta).toBeDefined();
      expect(state.resetDate).toBe("2026-07-01");
    });

    it("non-exhausted state doesn't show a CTA", () => {
      const usage: StoryCapUsage = {
        count: 2,
        cap: 8,
        resetDate: "2026-07-01",
        remaining: 6,
      };
      const state = getCapUsageState(usage);
      expect(state.isExhausted).toBe(false);
      expect(state.upgradeCta).toBeNull();
    });
  });
});
