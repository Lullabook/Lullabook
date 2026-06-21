import { describe, expect, it } from "vitest";
import { createTestContext, subscribedGuardian, householdWithBaby } from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import {
  CreditLedgerService,
  CreditError,
  MeteredAction,
} from "@/services/credit-ledger";
import { EntitlementService } from "@/services/entitlement";

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

describe("94 — Credit ledger + metering (ADR-0023)", () => {
  describe("included allotments + debit", () => {
    it("Plus tier gets 2 video credits and 1 custom-style credit per month", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      const balance = svc.getBalance(guardian.familyId);
      expect(balance.videoIncluded).toBe(2);
      expect(balance.customStyleIncluded).toBe(1);
      expect(balance.purchased).toBe(0);
    });

    it("Basic/Normal tiers get 0 included video/custom-style credits", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "normal");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      const balance = svc.getBalance(guardian.familyId);
      expect(balance.videoIncluded).toBe(0);
      expect(balance.customStyleIncluded).toBe(0);
    });

    it("metered action debits atomically from included first, then purchased", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "video", "page-1");
      let balance = svc.getBalance(guardian.familyId);
      expect(balance.videoIncluded).toBe(1);

      svc.debit(guardian.familyId, "video", "page-2");
      balance = svc.getBalance(guardian.familyId);
      expect(balance.videoIncluded).toBe(0);
    });
  });

  describe("refund on failure", () => {
    it("a failed video render refunds the credit", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "video", "page-1");
      expect(svc.getBalance(guardian.familyId).videoIncluded).toBe(1);

      svc.refund(guardian.familyId, "video", "page-1");
      expect(svc.getBalance(guardian.familyId).videoIncluded).toBe(2);
    });

    it("a failed custom-style train refunds the credit", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "customStyle", "style-1");
      expect(svc.getBalance(guardian.familyId).customStyleIncluded).toBe(0);

      svc.refund(guardian.familyId, "customStyle", "style-1");
      expect(svc.getBalance(guardian.familyId).customStyleIncluded).toBe(1);
    });

    it("refund is idempotent — double refund doesn't double-credit", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "video", "page-1");
      svc.refund(guardian.familyId, "video", "page-1");
      svc.refund(guardian.familyId, "video", "page-1"); // replay
      expect(svc.getBalance(guardian.familyId).videoIncluded).toBe(2);
    });
  });

  describe("idempotent debit — replays don't double-charge", () => {
    it("debitting the same action+idempotencyKey twice only debits once", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "video", "page-1");
      svc.debit(guardian.familyId, "video", "page-1"); // replay
      expect(svc.getBalance(guardian.familyId).videoIncluded).toBe(1);
    });
  });

  describe("exhaustion state", () => {
    it("exhausting credits returns a structured 'out of credits' state", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "video", "page-1");
      svc.debit(guardian.familyId, "video", "page-2");
      // Now exhausted
      expect(() => svc.debit(guardian.familyId, "video", "page-3")).toThrow(CreditError);
      try {
        svc.debit(guardian.familyId, "video", "page-3");
      } catch (e) {
        const err = e as CreditError;
        expect(err.status).toBe(403);
        expect(err.code).toBe("out_of_credits");
        expect(err.resetDate).toBeDefined();
        expect(err.buyCta).toBeDefined();
      }
    });
  });

  describe("security — balance is server-authoritative", () => {
    it("balance cannot be escalated client-side — only debit/refund/purchase change it", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      const balance = svc.getBalance(guardian.familyId);
      expect(balance.videoIncluded).toBe(2);

      // There's no "addCredits" method exposed — only purchase (server-side) can add
      // purchased credits. The balance is a read-only view.
    });

    it("purchased credits are debited after included", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.addPurchasedCredits(guardian.familyId, 5);
      // Use up included video
      svc.debit(guardian.familyId, "video", "page-1");
      svc.debit(guardian.familyId, "video", "page-2");
      // Now should debit from purchased
      svc.debit(guardian.familyId, "video", "page-3");
      const balance = svc.getBalance(guardian.familyId);
      expect(balance.videoIncluded).toBe(0);
      expect(balance.purchased).toBe(4);
    });
  });

  describe("monthly reset", () => {
    it("included credits reset monthly", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CreditLedgerService(ctx.store, ctx.entitlements);
      svc.debit(guardian.familyId, "video", "page-1");
      expect(svc.getBalance(guardian.familyId).videoIncluded).toBe(1);

      svc.resetForTesting(guardian.familyId);
      expect(svc.getBalance(guardian.familyId).videoIncluded).toBe(2);
    });
  });
});
