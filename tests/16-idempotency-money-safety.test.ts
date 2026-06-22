import { describe, expect, it } from "vitest";
import { StorybookService } from "@/services/storybook";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("16 — idempotency & money-safety", () => {
  async function readyPersona(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-16", "idempotent@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("workflow replay calls fal at most once per Page per attempt", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.workflow.simulateAtLeastOnceDelivery = true;
    ctx.fal.currentPage = 0;

    await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "replay moon",
    });
    await ctx.workflow.drain();

    expect(ctx.fal.imageCalls).toBe(12);
    expect(ctx.workflow.steps.filter((s) => s.endsWith(":memoized")).length).toBeGreaterThan(0);
  });

  it("replay upserts Page rows and uses stable blob keys without duplicates", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.workflow.simulateAtLeastOnceDelivery = true;

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "stable keys",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(new Set(pages.map((p) => p.id)).size).toBe(12);

    const readyPages = pages.filter((p) => p.generationStatus === "ready");
    const blobKeys = readyPages.map((p) => p.illustrationBlobKey);
    expect(blobKeys.every((k) => k?.startsWith(`books/${member.familyId}/${book.id}/page-`))).toBe(
      true
    );
    expect(new Set(blobKeys).size).toBe(readyPages.length);

    const stored = await ctx.blobs.list(`books/${member.familyId}/${book.id}/`);
    expect(stored.filter((k) => k.endsWith(".png") && !k.endsWith(".raw")).length).toBe(
      readyPages.length
    );
  });

  it("uses deterministic Page ids and blob keys inside the workflow", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "deterministic",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    for (const page of pages) {
      expect(page.id).toBe(`${book.id}-page-${page.index}`);
      if (page.generationStatus === "ready") {
        expect(page.illustrationBlobKey).toBe(
          `books/${member.familyId}/${book.id}/page-${page.index}.png`
        );
      }
    }
  });

  it("passes deterministic fal idempotency keys on generateImage", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "fal keys",
    });
    await ctx.workflow.drain();

    expect(ctx.fal.idempotencyKeys.filter((k) => !k.startsWith("roster-avatar/")).length).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(ctx.fal.idempotencyKeys).toContain(`${book.id}/${i}/0/fal-generate`);
    }
  });

  it("flips Storybook to failed when Claude pass yields no Story", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.anthropic.response = {
      text: "",
      pages: [],
      scenes: [],
      styleBible: { palette: "none", wardrobe: {}, artStyle: "none" },
    };

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "empty story",
    });
    await ctx.workflow.drain();

    const finished = ctx.store.getStorybook(book.id, member.id)!;
    expect(finished.status).toBe("failed");
    expect(ctx.store.getPagesForStorybook(book.id)).toHaveLength(0);
    expect(ctx.fal.imageCalls).toBe(0);
  });

  it("degrades to text-viewable draft (not failed) when all illustrations fail but text is present (issue 102)", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failPages = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    ctx.fal.currentPage = 0;

    const strictStorybooks = new StorybookService(
      ctx.store,
      ctx.anthropic,
      ctx.fal,
      ctx.childSafety,
      ctx.blobs,
      ctx.workflow,
      ctx.subscriptions,
      ctx.classicCatalog,
      false,
      null
    );

    const book = await strictStorybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "floor fail",
    });
    await ctx.workflow.drain();

    const finished = ctx.store.getStorybook(book.id, member.id)!;
    // Issue 102: text-viewable fallback — all illustrations failed but text
    // pages exist, so the book is a readable `draft`, not uniformly `failed`.
    expect(finished.status).toBe("draft");
    expect(
      ctx.store.getPagesForStorybook(book.id).filter((p) => p.generationStatus === "ready")
    ).toHaveLength(0);
    expect(
      ctx.store.getPagesForStorybook(book.id).filter((p) => p.text.length > 0)
    ).toHaveLength(12);
  });

  it("recoverPage regenerates a failed Page without decrementing re-roll budget", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failImageOnPage = 3;
    ctx.fal.currentPage = 0;

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "recover me",
    });
    await ctx.workflow.drain();

    const before = ctx.store.getStorybook(book.id, member.id)!;
    expect(before.rerollBudgetRemaining).toBe(5);
    const failedPage = ctx.store.getPagesForStorybook(book.id).find((p) => p.index === 2)!;
    expect(failedPage.generationStatus).toBe("failed");

    ctx.fal.failImageOnPage = null;
    ctx.fal.currentPage = 0;
    ctx.storybooks.recoverPage(member.id, failedPage.id);
    await ctx.workflow.drain();

    const after = ctx.store.getStorybook(book.id, member.id)!;
    expect(after.rerollBudgetRemaining).toBe(5);
    const recovered = ctx.store.pages.get(failedPage.id)!;
    expect(recovered.generationStatus).toBe("ready");
    expect(recovered.illustrationBlobKey).toBe(
      `books/${member.familyId}/${book.id}/page-2.png`
    );
  });

  it("parent rerollImage decrements the re-roll budget", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "reroll budget",
    });
    await ctx.workflow.drain();

    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    const before = ctx.store.getStorybook(book.id, member.id)!.rerollBudgetRemaining;

    ctx.storybooks.rerollImage(member.id, page.id);

    const after = ctx.store.getStorybook(book.id, member.id)!;
    expect(after.rerollBudgetRemaining).toBe(before - 1);
    expect(
      ctx.store.getCandidatesForPage(page.id).some((c) => c.id === `${page.id}-reroll-1`)
    ).toBe(true);
  });

  it("CSAM-positive generated image bytes trigger NCMEC escalation, not quarantine", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.moderation.blockedCsamImageContents = ["image-5"];

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "csam escalation",
    });
    await ctx.workflow.drain();

    const page = ctx.store.getPagesForStorybook(book.id).find((p) => p.index === 4)!;
    expect(page.generationStatus).toBe("failed");
    expect(page.generationStatus).not.toBe("quarantined");
    expect(page.illustrationBlobKey).toBeNull();

    const audit = [...ctx.store.moderationAudit.values()];
    expect(audit.some((a) => a.resourceType === "ncmec_report")).toBe(true);

    const blobKeys = await ctx.blobs.list(`books/${member.familyId}/${book.id}/page-4`);
    expect(blobKeys.some((k) => k.endsWith(".png") && !k.endsWith(".raw"))).toBe(false);
  });

  it("still reaches draft when isolated Page failures stay above the ready floor", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.fal.failImageOnPage = 3;
    ctx.fal.currentPage = 0;

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "isolated hole",
    });
    await ctx.workflow.drain();

    const finished = ctx.store.getStorybook(book.id, member.id)!;
    expect(finished.status).toBe("draft");
    expect(
      ctx.store.getPagesForStorybook(book.id).filter((p) => p.generationStatus === "ready")
    ).toHaveLength(11);
  });
});
