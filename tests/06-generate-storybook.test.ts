import { describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("06 — generate storybook (single persona)", () => {
  async function readyPersona(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-story", "story@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("generates a draft storybook with ~12 pages from a Brief", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "bedtime adventure",
      note: "loves ducks",
    });

    expect(book.status).toBe("draft");
    expect(book.styleBible).not.toBeNull();
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
    expect(ctx.anthropic.calls).toHaveLength(1);
  });

  it("isolates a single page image failure while other pages complete", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failImageOnPage = 3;
    ctx.fal.currentPage = 0;

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "resilience",
    });

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(pages.filter((p) => p.generationStatus === "failed")).toHaveLength(1);
    expect(pages.filter((p) => p.generationStatus === "ready")).toHaveLength(11);
    expect(book.status).toBe("draft");
  });
});
