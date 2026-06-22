import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 118 — Enforce the monthly Story cap at generation.
 */
describe("118 — enforce monthly story cap", () => {
  async function readyMember(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-118", "g@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("blocks generation beyond the plan's monthly cap (Just Us = 8)", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    // Just Us default → cap = 8. Generate 8 books, then the 9th should fail.
    for (let i = 0; i < 8; i++) {
      const book = await ctx.storybooks.generate(member.id, {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: `story ${i}`,
      });
      await ctx.workflow.drain();
      // Mark as non-failed so it counts
      const stored = ctx.store.getStorybook(book.id, member.id)!;
      stored.status = "draft";
      ctx.store.saveStorybook(stored);
    }

    await expect(
      ctx.storybooks.generate(member.id, {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: "over cap",
      })
    ).rejects.toThrow(/cap/i);
  });

  it("failed generations don't count toward the cap", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    // Generate 8 failed books — they shouldn't consume cap slots
    for (let i = 0; i < 8; i++) {
      const book = await ctx.storybooks.generate(member.id, {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: `failed ${i}`,
      });
      await ctx.workflow.drain();
      const stored = ctx.store.getStorybook(book.id, member.id)!;
      stored.status = "failed";
      ctx.store.saveStorybook(stored);
    }

    // Should still be able to generate (all previous were failed)
    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "should work",
    });
    expect(book.id).toBeTruthy();
  });
});
