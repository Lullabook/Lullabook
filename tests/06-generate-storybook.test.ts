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
  it("recovers a failed book to draft when enough pages are recovered", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failPages = new Set([3, 4, 5]); // 3 failed pages
    ctx.fal.currentPage = 0;

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "recovery",
    });

    expect(book.status).toBe("failed");
    
    // Now recover one page
    const failedPages = ctx.store.getPagesForStorybook(book.id).filter(p => p.generationStatus === "failed");
    ctx.fal.failPages = new Set(); // let it succeed
    await ctx.storybooks.recoverPage(member.id, failedPages[0].id);
    await ctx.workflow.drain();

    const updatedBook = ctx.store.storybooks.get(book.id)!;
    expect(updatedBook.status).toBe("draft");
  });

  it("selectCandidate stores moderated blob key and clears raw URL", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "reroll",
    });

    const page = ctx.store.getPagesForStorybook(book.id)[0];
    
    ctx.storybooks.rerollImage(member.id, page.id);
    const candidate = ctx.store.getCandidatesForPage(page.id)[0];
    
    const globalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from("new-image-bytes")
    }) as any;
    
    await ctx.storybooks.selectCandidate(member.id, candidate.id);
    
    const updatedPage = ctx.store.pages.get(page.id)!;
    expect(updatedPage.illustrationBlobKey).toBe(`${book.id}/pages/${page.id}/selected-${candidate.id}.png`);
    expect(updatedPage.illustrationUrl).toBeNull();
    
    ctx.moderation.blockedImages.push(Buffer.from("bad-image").length);
    global.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from("bad-image")
    }) as any;
    
    ctx.storybooks.rerollImage(member.id, page.id);
    const badCandidate = ctx.store.getCandidatesForPage(page.id)[1];
    
    await expect(ctx.storybooks.selectCandidate(member.id, badCandidate.id)).rejects.toThrow(/unsafe/i);
    global.fetch = globalFetch;
  });

  it("settles as a terminal hole when page recovery retries are exhausted", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failImageOnPage = 3;
    ctx.fal.currentPage = 0;

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "exhaustion",
    });

    const failedPage = ctx.store.getPagesForStorybook(book.id).find(p => p.generationStatus === "failed")!;
    
    const { pageRecover } = await import("@/workflows/functions");
    const contextModule = await import("@/lib/context");
    const vi = await import("vitest");
    (ctx.store as any).hydrateByMemberId = async () => {};
    (ctx.store as any).sync = async () => {};
    (ctx as any).persist = async () => {};
    (ctx.workflow as any).runWithStepContext = async () => {
      throw new Error("Terminal failure");
    };
    const spy = vi.vi.spyOn(contextModule, "createRequestContext").mockReturnValue(ctx as any);

    try {
      await expect(pageRecover.fn({
        event: { data: { pageId: failedPage.id, memberId: member.id, attempt: 1 } },
        step: {}
      } as any)).rejects.toThrow("Terminal failure");
    } finally {
      spy.mockRestore();
    }

    const updatedPage = ctx.store.pages.get(failedPage.id)!;
    expect(updatedPage.generationStatus).toBe("failed");
  });
});
