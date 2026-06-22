import { describe, expect, it } from "vitest";
import {
  createReadyAdult,
  createTestContext,
  generateAndWait,
  goodPhoto,
  householdWithBaby,
  subscribedGuardian,
  withActiveSubscription,
} from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import { StoryCapService, StoryCapError } from "@/services/story-cap";
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

describe("93 — Story-cap & member-cap enforcement (ADR-0023)", () => {
  describe("story cap", () => {
    it("counts stories against the Household's monthly cap", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "basic"); // cap 4

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      const usage = svc.getUsage(guardian.familyId, guardian.id);
      expect(usage.count).toBe(0);
      expect(usage.cap).toBe(4);
    });

    it("at cap, a new generation is refused server-side with a structured limit state", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "basic"); // cap 4

      // Fill the cap
      for (let i = 0; i < 4; i++) {
        await generateAndWait(ctx, guardian.id, {
          starringPersonaIds: [],
          babyId: baby.id,
          storyType: "everyday",
          theme: `Story ${i}`,
        });
      }

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      expect(() => svc.requireUnderCap(guardian.familyId, guardian.id)).toThrow(StoryCapError);
      try {
        svc.requireUnderCap(guardian.familyId, guardian.id);
      } catch (e) {
        const err = e as StoryCapError;
        expect(err.status).toBe(403);
        expect(err.count).toBe(4);
        expect(err.cap).toBe(4);
        expect(err.resetDate).toBeDefined();
        expect(err.upgradeCta).toBeDefined();
      }
    });

    it("under cap, generation proceeds", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal"); // cap 8

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      expect(() => svc.requireUnderCap(guardian.familyId, guardian.id)).not.toThrow();
    });

    it("Plus tier has cap 20", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "plus");

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      const usage = svc.getUsage(guardian.familyId, guardian.id);
      expect(usage.cap).toBe(20);
    });
  });

  describe("idempotent enforcement — replays don't bypass", () => {
    it("a replayed/duplicate generation request can't consume two slots", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "basic");

      // Generate one book — this creates a storybook in the store (the count source)
      const book = await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [],
        babyId: baby.id,
        storyType: "everyday",
        theme: "Story 1",
      });

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      // "Replay" — recordGeneration with the same book id is idempotent
      svc.recordGeneration(guardian.familyId, guardian.id, book.id);
      svc.recordGeneration(guardian.familyId, guardian.id, book.id);
      const usage = svc.getUsage(guardian.familyId, guardian.id);
      expect(usage.count).toBe(1);
    });

    it("calling requireUnderCap twice in a row doesn't bump the count", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "basic");

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      svc.requireUnderCap(guardian.familyId, guardian.id);
      svc.requireUnderCap(guardian.familyId, guardian.id);
      const usage = svc.getUsage(guardian.familyId, guardian.id);
      expect(usage.count).toBe(0);
    });
  });

  describe("monthly reset", () => {
    it("reset restores the allowance", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "basic");

      for (let i = 0; i < 4; i++) {
        await generateAndWait(ctx, guardian.id, {
          starringPersonaIds: [],
          babyId: baby.id,
          storyType: "everyday",
          theme: `Story ${i}`,
        });
      }

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      expect(svc.getUsage(guardian.familyId, guardian.id).count).toBe(4);

      // Simulate monthly reset by advancing the period
      svc.resetForTesting(guardian.familyId, guardian.id);
      expect(svc.getUsage(guardian.familyId, guardian.id).count).toBe(0);
      expect(() => svc.requireUnderCap(guardian.familyId, guardian.id)).not.toThrow();
    });
  });

  describe("failed generation does not consume a slot", () => {
    it("a failed storybook (status=failed) is not counted", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "basic");

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        babyId: baby.id,
        storyType: "everyday",
        theme: "Will fail",
      });
      // Mark as failed
      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      stored.status = "failed";
      ctx.store.storybooks.set(book.id, stored);

      const svc = new StoryCapService(ctx.store, ctx.entitlements);
      const usage = svc.getUsage(guardian.familyId, guardian.id);
      expect(usage.count).toBe(0);
    });
  });

  describe("member cap", () => {
    it("creating a member beyond the tier cap is rejected server-side", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "basic"); // member cap 2

      // Create 2 adults (fills the cap)
      await createReadyAdult(ctx, guardian, "Adult 1");
      await createReadyAdult(ctx, guardian, "Adult 2");

      // The (cap+1)th should be rejected
      await expect(createReadyAdult(ctx, guardian, "Adult 3")).rejects.toThrow(/cap/i);
    });

    it("Plus tier has unlimited members", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      for (let i = 0; i < 6; i++) {
        await createReadyAdult(ctx, guardian, `Adult ${i}`);
      }
      // Should not throw — Plus is unlimited
    });
  });
});
