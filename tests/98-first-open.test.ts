import { describe, expect, it } from "vitest";
import { createTestContext, subscribedGuardian, householdWithBaby, goodPhoto } from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import { DemoStoryService, FirstOpenService } from "@/services/first-open";
import { EntitlementError } from "@/services/entitlement";

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

describe("98 — First-open demo aha + Day-0 paywall", () => {
  describe("pre-baked baby-free demo Story", () => {
    it("a first-time user reaches a playable demo Story without signup or card", () => {
      const svc = new DemoStoryService();
      const demo = svc.getDemoStory();
      expect(demo).toBeDefined();
      expect(demo.title).toBeTruthy();
      expect(demo.pages.length).toBeGreaterThan(0);
      expect(demo.isBabyFree).toBe(true);
      expect(demo.requiresSignup).toBe(false);
      expect(demo.requiresCard).toBe(false);
    });

    it("the demo is baby-free (no child likeness)", () => {
      const svc = new DemoStoryService();
      const demo = svc.getDemoStory();
      expect(demo.isBabyFree).toBe(true);
      // The demo stars a fictional character, not a real child
      expect(demo.characters).toBeDefined();
      expect(demo.characters.length).toBeGreaterThan(0);
      expect(demo.characters.every((c) => c.isFictional)).toBe(true);
    });

    it("the demo is playable in <90s (short page count)", () => {
      const svc = new DemoStoryService();
      const demo = svc.getDemoStory();
      // A demo with <=6 pages at ~15s/page is under 90s
      expect(demo.pages.length).toBeLessThanOrEqual(6);
    });
  });

  describe("baby-upload gate", () => {
    it("uploading the real baby is gated behind starting the trial (card-on-file VPC)", async () => {
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

    it("after starting the trial, baby upload is unblocked", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("g", "g@example.com");
      ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

      const rc = ctx.revenuecat;
      await ctx.revenuecatPurchases.startTrial(guardian.familyId, "normal", {
        hasPaymentMethod: true,
      });

      const baby = await ctx.personas.createBaby({
        memberId: guardian.id,
        displayName: "Baby",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      });
      expect(baby.kind).toBe("baby");
    });
  });

  describe("paywall placement — after the aha, not before", () => {
    it("the first-open flow shows demo first, then paywall", () => {
      const svc = new FirstOpenService();
      const flow = svc.getFlow();
      expect(flow.steps[0].type).toBe("demo");
      expect(flow.steps[flow.steps.length - 1].type).toBe("paywall");
    });

    it("the paywall appears after the demo, not before", () => {
      const svc = new FirstOpenService();
      const flow = svc.getFlow();
      const demoIdx = flow.steps.findIndex((s) => s.type === "demo");
      const paywallIdx = flow.steps.findIndex((s) => s.type === "paywall");
      expect(paywallIdx).toBeGreaterThan(demoIdx);
    });

    it("annual is the default option on the paywall", () => {
      const svc = new FirstOpenService();
      const flow = svc.getFlow();
      expect(flow.defaultBilling).toBe("annual");
    });
  });

  describe("failure — demo asset fails to load", () => {
    it("if the demo asset fails, the user still reaches a usable state", () => {
      const svc = new FirstOpenService();
      const flow = svc.onDemoFailed();
      // Should have a skip-to-paywall option, not a white screen
      expect(flow.canSkipToPaywall).toBe(true);
      expect(flow.hasUsableState).toBe(true);
    });
  });
});
