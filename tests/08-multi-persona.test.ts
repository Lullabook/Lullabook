import { describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, goodPhoto } from "@/test/fixtures";

describe("08 — multi-persona composition", () => {
  async function twoReadyPersonas(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-multi", "multi@example.com");
    const adult = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Parent",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const guardian = member;
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_m", "sub_m");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const baby = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Baby",
      photos: [goodPhoto(0xab), goodPhoto(0xab), goodPhoto(0xab)],
    });
    return { member, adult, baby };
  }

  it("generates pages with two personas using inpaint path by default", async () => {
    const ctx = createTestContext();
    const { member, adult, baby } = await twoReadyPersonas(ctx);

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [baby.id, adult.id],
      storyType: "bedtime",
      theme: "park day",
    });

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.every((p) => p.personaCount === 2)).toBe(true);
    expect(ctx.fal.imageCalls).toBeGreaterThan(0);
  });

  it("uses reference-model fallback when multi-persona gate fails", async () => {
    const ctx = createTestContext();
    const { member, adult, baby } = await twoReadyPersonas(ctx);

    const started = await ctx.multiStorybooks.generate(member.id, {
      starringPersonaIds: [baby.id, adult.id],
      storyType: "learning",
      theme: "fallback path",
    });
    await ctx.workflow.drain();

    const book = ctx.store.getStorybook(started.id, member.id)!;
    expect(book.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages[0].illustrationBlobKey).toMatch(/^books\//);
  });
});
