import { describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 102 — Text-viewable Storybook fallback when illustration is unavailable.
 *
 * When the illustration path is entirely unavailable (fal throws, blob store
 * down), every page lands `failed` for the image. The book should still reach
 * a readable text-viewable `draft` (not uniformly `failed` and not an infinite
 * spinner) so the parent can read the generated story text. The reader renders
 * page text gracefully when `illustrationBlobKey` is null.
 */
describe("102 — text-viewable storybook fallback", () => {
  async function readyMember(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-102", "text@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("reaches a readable `draft` (text-viewable) when every illustration fails", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    // Make every image generation throw — simulates fal / blob store unavailable.
    ctx.fal.failImageOnPage = 0;
    ctx.fal.failPages = new Set(Array.from({ length: 12 }, (_, i) => i + 1));

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "text-only fallback",
    });

    // The book reaches a readable draft — not uniformly `failed`.
    expect(book.status).toBe("draft");

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    // Every page has text (the reader can render it).
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
    // Every page is illustration-failed but the text is still present.
    expect(pages.every((p) => p.generationStatus === "failed")).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey === null)).toBe(true);
  });

  it("still marks a book `failed` when the claude pass produced no story text at all", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    // No pages and no scenes — the text generation itself failed.
    const original = ctx.anthropic.response;
    ctx.anthropic.response = {
      ...original,
      pages: [],
      scenes: [],
    };

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "no text at all",
    });

    expect(book.status).toBe("failed");
    ctx.anthropic.response = original;
  });
});
