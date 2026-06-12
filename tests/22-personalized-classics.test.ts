import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("22 — personalized classics", () => {
  async function readyPersona(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-22", "classic@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Grandma",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("generates a draft Personalized Classic from a catalog tale starring Personas", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generateFromClassic(member.id, "alice-in-wonderland", {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "placeholder",
    });
    await ctx.workflow.drain();

    const finished = ctx.store.getStorybook(book.id, member.id)!;
    expect(finished.status).toBe("draft");
    expect(finished.brief.theme).toBe("Alice in Wonderland");
    expect(ctx.store.getPagesForStorybook(book.id)).toHaveLength(12);
    expect(ctx.anthropic.adaptCalls).toHaveLength(1);
    expect(ctx.anthropic.calls).toHaveLength(0);
  });

  it("reuses the productionized workflow body (blob keys, moderation, idempotency)", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.workflow.simulateAtLeastOnceDelivery = true;
    ctx.fal.currentPage = 0;

    const book = await ctx.storybooks.generateFromClassic(member.id, "princess-and-pea", {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "placeholder",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(ctx.fal.imageCalls).toBe(12);
    expect(ctx.workflow.steps.filter((s) => s.endsWith(":memoized")).length).toBeGreaterThan(0);

    const readyPages = pages.filter((p) => p.generationStatus === "ready");
    expect(
      readyPages.every(
        (p) => p.illustrationBlobKey === `books/${member.familyId}/${book.id}/page-${p.index}.png`
      )
    ).toBe(true);
  });

  it("rejects arbitrary classic ids not in the public-domain catalog", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    await expect(
      ctx.storybooks.generateFromClassic(member.id, "frozen-2013", {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: "placeholder",
      })
    ).rejects.toThrow(/catalog/i);

    expect(ctx.anthropic.adaptCalls).toHaveLength(0);
    expect(ctx.fal.imageCalls).toBe(0);
  });

  it("moderates a custom twist like a Brief before generation", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.moderation.blockedTexts.push("badtwist");

    await expect(
      ctx.storybooks.generateFromClassic(member.id, "alice-in-wonderland", {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: "placeholder",
        note: "add a badtwist ending",
      })
    ).rejects.toThrow(/unsafe/i);

    expect(ctx.anthropic.adaptCalls).toHaveLength(0);
    expect(ctx.store.storybooks.size).toBe(0);
  });

  it("passes Story Type to adaptStory so adaptation honors the chosen type", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    await ctx.storybooks.generateFromClassic(member.id, "alice-in-wonderland", {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "placeholder",
      note: "count the tea cups",
    });
    await ctx.workflow.drain();

    const adaptInput = ctx.anthropic.adaptCalls[0] as {
      storyType: string;
      twist?: string;
      sourceTale: { id: string };
    };
    expect(adaptInput.storyType).toBe("learning");
    expect(adaptInput.twist).toBe("count the tea cups");
    expect(adaptInput.sourceTale.id).toBe("alice-in-wonderland");
  });

  it("isolates a single page failure while the classic book still reaches draft", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failImageOnPage = 5;
    ctx.fal.currentPage = 0;

    const book = await ctx.storybooks.generateFromClassic(member.id, "princess-and-pea", {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "placeholder",
    });
    await ctx.workflow.drain();

    const finished = ctx.store.getStorybook(book.id, member.id)!;
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(finished.status).toBe("draft");
    expect(pages.filter((p) => p.generationStatus === "failed")).toHaveLength(1);
    expect(pages.filter((p) => p.generationStatus === "ready")).toHaveLength(11);
  });
});
