import { describe, expect, it } from "vitest";
import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  householdWithBabyUnconfirmed,
  subscribedGuardian,
} from "@/test/fixtures";

/**
 * Issue 125 — Real persona likeness in dev + a real likeness-confirmation gate.
 *
 * Before: `acceptLikeness` was a no-op and nothing gated on it, so a book could
 * be generated from a persona whose likeness the parent never reviewed. Now a
 * created persona reaches `ready` with `likenessConfirmed = false`; the parent
 * must review samples + accept BEFORE any book-generation spend. Training
 * failure still → persona `failed` (no charge) — already covered by 03.
 *
 * `generateAndWait` auto-accepts likeness for the convenience of the wider
 * suite, so these gate tests call `ctx.storybooks.generate` directly to exercise
 * the block.
 */

describe("125 — likeness-confirmation gate", () => {
  it("a ready-but-unconfirmed persona cannot generate a book (no spend)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);

    // Persona is ready (training synthesized) but NOT likeness-confirmed.
    expect(babyPersona.status).toBe("ready");
    expect(babyPersona.likenessConfirmed).toBe(false);

    // The gate fires inside `generate` BEFORE any workflow is enqueued — no spend.
    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "should be blocked",
      })
    ).rejects.toThrow(/likeness/i);

    expect(ctx.store.listStorybooksForBaby(baby.id, guardian.id)).toHaveLength(0);
  });

  it("after acceptLikeness, the same persona generates an illustrated draft", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);

    ctx.personas.acceptLikeness(babyPersona.id, guardian.id);
    expect(
      ctx.store.getPersona(babyPersona.id, guardian.id)?.likenessConfirmed
    ).toBe(true);

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "now allowed",
    });
    expect(book.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);
  });

  it("likeness samples are available once ready, empty before", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    expect(ctx.personas.getLikenessSamples("unknown", guardian.id)).toEqual([]);

    const babyPersona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    const samples = ctx.personas.getLikenessSamples(babyPersona.id, guardian.id);
    expect(samples.length).toBeGreaterThan(0);
  });

  it("in dev (DevFalFallback) a created Baby Persona reaches ready with a usable placeholder LoRA + avatar", async () => {
    const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });
    const guardian = await subscribedGuardian(ctx);
    const babyPersona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(babyPersona.status).toBe("ready");
    expect(babyPersona.loraWeightKey).not.toBeNull();
    expect(babyPersona.avatarKey).not.toBeNull();
    // But likeness is NOT yet confirmed — the gate still applies in dev.
    expect(babyPersona.likenessConfirmed).toBe(false);
  });

  it("a failed persona cannot generate (no charge) — the readiness gate", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    babyPersona.status = "failed";
    ctx.store.savePersona(babyPersona);

    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "failed persona",
      })
    ).rejects.toThrow(/not ready/i);
  });
});
