import { describe, expect, it } from "vitest";
import {
  createReadyAdult,
  createTestContext,
  goodPhoto,
  householdWithBaby,
  subscribedGuardian,
} from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import {
  EntitlementError,
  EntitlementService,
  TIER_ENTITLEMENTS,
} from "@/services/entitlement";

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

describe("91 — Tier & entitlement model (ADR-0023)", () => {
  describe("tier → caps + capability flags", () => {
    it("Basic $8: 4 stories, 2 members, narration/video/customStyle all off", () => {
      expect(TIER_ENTITLEMENTS.basic).toEqual({
        tier: "basic",
        storyCap: 4,
        memberCap: 2,
        canNarrate: false,
        canVideo: false,
        canCustomStyle: false,
      });
    });
    it("Normal $15: 8 stories, 4 members, narration on; video/customStyle off", () => {
      expect(TIER_ENTITLEMENTS.normal).toEqual({
        tier: "normal",
        storyCap: 8,
        memberCap: 4,
        canNarrate: true,
        canVideo: false,
        canCustomStyle: false,
      });
    });
    it("Plus $25: 20 stories, unlimited members, narration/video/customStyle on", () => {
      expect(TIER_ENTITLEMENTS.plus).toEqual({
        tier: "plus",
        storyCap: 20,
        memberCap: Infinity,
        canNarrate: true,
        canVideo: true,
        canCustomStyle: true,
      });
    });
  });

  describe("tier derivation", () => {
    it("active sub with an explicit tier uses it", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      expect(ent.getTier(guardian.familyId)).toBe("plus");
      expect(ent.getEntitlement(guardian.familyId).canVideo).toBe(true);
    });

    it("active sub with no tier defaults to Normal (the trial/anchor tier)", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      expect(ent.getTier(guardian.familyId)).toBe("normal");
    });

    it("no subscription → unentitled (tier none, all capabilities off, zero caps)", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser(
        "solo",
        "s@example.com"
      );
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      expect(ent.getTier(guardian.familyId)).toBe("none");
      const e = ent.getEntitlement(guardian.familyId);
      expect(e.canNarrate).toBe(false);
      expect(e.canVideo).toBe(false);
      expect(e.storyCap).toBe(0);
    });
  });

  describe("capability gates reject unentitled calls with 403 (idempotent)", () => {
    it("Basic → narration 403; Normal → allowed; Plus → allowed", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "basic");
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      const basicErr = capture(() =>
        ent.requireCapability(guardian.familyId, "narrate")
      );
      expect(basicErr).toBeInstanceOf(EntitlementError);
      expect((basicErr as EntitlementError).status).toBe(403);
      // Idempotent: replaying the check yields the same 403, no state mutation.
      const replay = capture(() =>
        ent.requireCapability(guardian.familyId, "narrate")
      );
      expect(replay).toBeInstanceOf(EntitlementError);

      setTier(ctx, guardian.familyId, "normal");
      expect(() =>
        ent.requireCapability(guardian.familyId, "narrate")
      ).not.toThrow();
      setTier(ctx, guardian.familyId, "plus");
      expect(() =>
        ent.requireCapability(guardian.familyId, "narrate")
      ).not.toThrow();
    });

    it("Basic + Normal → video 403; Plus → allowed", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      for (const tier of ["basic", "normal"] as Tier[]) {
        setTier(ctx, guardian.familyId, tier);
        const err = capture(() =>
          ent.requireCapability(guardian.familyId, "video")
        );
        expect(err).toBeInstanceOf(EntitlementError);
        expect((err as EntitlementError).status).toBe(403);
      }
      setTier(ctx, guardian.familyId, "plus");
      expect(() =>
        ent.requireCapability(guardian.familyId, "video")
      ).not.toThrow();
    });

    it("Basic + Normal → custom-style 403; Plus → allowed (seam for issue 95)", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      setTier(ctx, guardian.familyId, "normal");
      expect(
        capture(() => ent.requireCapability(guardian.familyId, "customStyle"))
      ).toBeInstanceOf(EntitlementError);
      setTier(ctx, guardian.familyId, "plus");
      expect(() =>
        ent.requireCapability(guardian.familyId, "customStyle")
      ).not.toThrow();
    });

    it("an unentitled (none) family is rejected at every gate", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser(
        "none",
        "n@example.com"
      );
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      expect(
        capture(() => ent.requireEntitled(guardian.familyId))
      ).toBeInstanceOf(EntitlementError);
      expect(
        capture(() => ent.requireCapability(guardian.familyId, "narrate"))
      ).toBeInstanceOf(EntitlementError);
    });
  });

  describe("Family-member cap (requireMemberSlot — the gate issue 93 wires)", () => {
    // Issue 91 owns the gate method + cap config; issue 93 wires it into
    // PersonaService.createAdult. Here we exercise the method directly,
    // seeding adult personas into the store to control the roster count.
    let seq = 0;
    function seedAdult(ctx: ReturnType<typeof createTestContext>, familyId: string, n: number) {
      for (let i = 0; i < n; i++) {
        ctx.store.savePersona({
          id: `adult-${seq++}`,
          familyId,
          createdByMemberId: "x",
          kind: "adult",
          displayName: `Adult ${seq}`,
          status: "ready",
          loraWeightKey: null,
          avatarKey: null,
          createdAt: new Date(),
        });
      }
    }

    it("Basic maps to Just Us (ADR-0028): shared 3-Persona cap enforced at 403", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      setTier(ctx, guardian.familyId, "basic");

      seedAdult(ctx, guardian.familyId, 2);
      expect(() =>
        ent.requireMemberSlot(guardian.familyId, guardian.id)
      ).not.toThrow();

      seedAdult(ctx, guardian.familyId, 1); // roster now 3 == plan cap
      const atCap = capture(() =>
        ent.requireMemberSlot(guardian.familyId, guardian.id)
      );
      expect(atCap).toBeInstanceOf(EntitlementError);
      expect((atCap as EntitlementError).status).toBe(403);
    });

    it("Normal maps to Just Us (ADR-0028): 2 allowed, 3rd slot request rejected", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      setTier(ctx, guardian.familyId, "normal");

      seedAdult(ctx, guardian.familyId, 2);
      expect(() =>
        ent.requireMemberSlot(guardian.familyId, guardian.id)
      ).not.toThrow();
      seedAdult(ctx, guardian.familyId, 1); // roster 3 == plan cap
      expect(
        capture(() => ent.requireMemberSlot(guardian.familyId, guardian.id))
      ).toBeInstanceOf(EntitlementError);
    });

    it("Plus cap=∞: never rejects even at a large roster", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const ent = new EntitlementService(ctx.store, ctx.subscriptions);
      setTier(ctx, guardian.familyId, "plus");
      seedAdult(ctx, guardian.familyId, 50);
      expect(() =>
        ent.requireMemberSlot(guardian.familyId, guardian.id)
      ).not.toThrow();
    });
  });

  describe("wired gates (service seam, real 403 boundary)", () => {
    it("Storybook generation with a voice brief on Basic → 403 narration gate; on Normal → proceeds", async () => {
      // Issue 145 — audio is cut from R1 by default; opt back in to exercise the
      // narration entitlement gate (the R2 path this test pins).
      const prev = process.env.R1_AUDIO_ENABLED;
      process.env.R1_AUDIO_ENABLED = "true";
      try {
      const ctx = createTestContext();
      const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
      const priya = await createReadyAdult(ctx, guardian, "Priya");
      ctx.familyRoster.updateBond({
        memberId: guardian.id,
        babyId: baby.id,
        personaId: priya.id,
        relationship: "Mom",
        babyCallsThem: "Mama",
        theyCallBaby: "star",
      });
      ctx.voiceClips.recordConsent(guardian.id, priya.id);
      const clip = await ctx.voiceClips.uploadClip({
        memberId: guardian.id,
        personaId: priya.id,
        label: "night",
        transcript: "Goodnight.",
        durationSecs: 2,
        audioBytes: Buffer.from("a"),
      });

      setTier(ctx, guardian.familyId, "basic");
      await expect(
        ctx.storybooks.generate(guardian.id, {
          starringPersonaIds: [priya.id, babyPersona.id],
          babyId: baby.id,
          storyType: "bedtime",
          theme: "Sleepy",
          voiceClipIds: [clip.id],
        })
      ).rejects.toThrow(/narration|narrate|tier|subscription/i);

      setTier(ctx, guardian.familyId, "normal");
      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [priya.id, babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "Sleepy",
        voiceClipIds: [clip.id],
      });
      expect(book.status).toBe("generating");
      } finally {
        if (prev === undefined) delete process.env.R1_AUDIO_ENABLED;
        else process.env.R1_AUDIO_ENABLED = prev;
      }
    });

    it("an unentitled family cannot generate a Storybook at all (403, not just a hidden button)", async () => {
      const ctx = createTestContext();
      const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
      // Cancel the subscription → tier becomes "none" (canceled ≠ active).
      ctx.subscriptions.cancel(guardian.familyId);
      await expect(
        ctx.storybooks.generate(guardian.id, {
          starringPersonaIds: [babyPersona.id],
          babyId: baby.id,
          storyType: "bedtime",
          theme: "x",
        })
      ).rejects.toThrow(/subscription|entitlement|tier|not entitled/i);
    });
  });
});

function capture(fn: () => void): unknown {
  try {
    fn();
    return undefined;
  } catch (err) {
    return err;
  }
}