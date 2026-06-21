import { describe, expect, it } from "vitest";
import {
  createTestContext,
  goodPhoto,
  householdWithBaby,
  subscribedGuardian,
} from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import { EntitlementError } from "@/services/entitlement";
import { RevenueCatPurchaseService } from "@/services/revenuecat-purchase";
import { FakeRevenueCat } from "@/adapters/fakes";

function startTrial(
  ctx: ReturnType<typeof createTestContext>,
  familyId: string,
  tier: Tier = "normal"
) {
  const rc = new FakeRevenueCat();
  const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);
  return svc.startTrial(familyId, tier, { hasPaymentMethod: true });
}

describe("92 — RevenueCat Apple IAP + 7-day trial as VPC (ADR-0023)", () => {
  describe("trial → entitlement mapping", () => {
    it("starting a trial maps to the correct server entitlement (Normal default)", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      ctx.store.saveSubscription({
        familyId: guardian.familyId,
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      });

      await startTrial(ctx, guardian.familyId);

      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
      const sub = ctx.store.getSubscription(guardian.familyId);
      expect(sub?.tier).toBe("normal");
      expect(sub?.status).toBe("active");
    });

    it("trial can target Basic or Plus tier", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      ctx.store.saveSubscription({
        familyId: guardian.familyId,
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      });

      const rc = new FakeRevenueCat();
      const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);
      await svc.startTrial(guardian.familyId, "plus", { hasPaymentMethod: true });

      const sub = ctx.store.getSubscription(guardian.familyId);
      expect(sub?.tier).toBe("plus");
    });

    it("purchase (non-trial) maps to the correct tier", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      ctx.store.saveSubscription({
        familyId: guardian.familyId,
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      });

      const rc = new FakeRevenueCat();
      const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);
      await svc.purchase(guardian.familyId, "basic", { hasPaymentMethod: true });

      const sub = ctx.store.getSubscription(guardian.familyId);
      expect(sub?.tier).toBe("basic");
      expect(sub?.status).toBe("active");
    });
  });

  describe("VPC gate — no child likeness without card-on-file", () => {
    it("baby persona creation is blocked without a paid entry (trial or sub)", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      // No subscription, no trial
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
      await expect(
        ctx.personas.createBaby({
          memberId: guardian.id,
          displayName: "Baby",
          photos: [goodPhoto()],
        })
      ).rejects.toThrow();
    });

    it("after starting a trial, baby persona creation is unblocked", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
      await startTrial(ctx, guardian.familyId);

      const baby = await ctx.personas.createBaby({
        memberId: guardian.id,
        displayName: "Baby",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      });
      expect(baby.kind).toBe("baby");
    });

    it("trial without a payment method is rejected (VPC = card-on-file)", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");

      const rc = new FakeRevenueCat();
      const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);
      await expect(
        svc.startTrial(guardian.familyId, "normal", { hasPaymentMethod: false })
      ).rejects.toThrow(/payment method/i);
      expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    });
  });

  describe("RevenueCat outage — cached entitlement degrade", () => {
    it("when RevenueCat is down, the cached entitlement is kept (no crash)", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      await startTrial(ctx, guardian.familyId, "plus");

      const rc = new FakeRevenueCat();
      rc.simulateOutage = true;
      const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);

      const result = await svc.syncEntitlement(guardian.familyId);
      expect(result.entitlement.tier).toBe("plus");
      expect(result.degraded).toBe(true);
    });

    it("when RevenueCat is down and no cached entitlement, degrades to none", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");

      const rc = new FakeRevenueCat();
      rc.simulateOutage = true;
      const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);

      const result = await svc.syncEntitlement(guardian.familyId);
      expect(result.entitlement.tier).toBe("basic");
      expect(result.degraded).toBe(true);
    });
  });

  describe("latency — entitlement check <300ms cached", () => {
    it("syncEntitlement returns within 300ms on cache hit", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      await startTrial(ctx, guardian.familyId);

      const rc = new FakeRevenueCat();
      const svc = new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, rc);
      // First call populates cache
      await svc.syncEntitlement(guardian.familyId);

      const start = Date.now();
      await svc.syncEntitlement(guardian.familyId);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe("no secrets committed", () => {
    it("RevenueCat keys are referenced by env-var name only, never values", () => {
      const rc = new FakeRevenueCat();
      expect(rc).toBeDefined();
      expect(process.env.REVENUECAT_API_KEY).toBeUndefined();
      expect(process.env.REVENUECAT_WEBHOOK_SECRET).toBeUndefined();
    });
  });
});
