import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("15 — durable generation spine", () => {
  async function readyPersona(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-15", "gen@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("returns a generating Storybook immediately; workflow completes afterward", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "moon adventure",
    });

    expect(book.status).toBe("generating");
    expect(ctx.store.getPagesForStorybook(book.id)).toHaveLength(0);

    await ctx.workflow.drain();

    const finished = ctx.store.getStorybook(book.id, member.id)!;
    expect(finished.status).toBe("draft");
    expect(ctx.store.getPagesForStorybook(book.id)).toHaveLength(12);
  });

  it("persists Story + Scenes + Style Bible before fan-out reads them", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "counting stars",
    });
    await ctx.workflow.drain();

    const persisted = ctx.store.getPersistedGeneration(book.id);
    expect(persisted?.story.styleBible.artStyle).toBe("watercolor");
    expect(persisted?.story.pages).toHaveLength(12);
    expect(persisted?.story.scenes).toHaveLength(12);
  });

  it("incorporates the Style Bible into each Page image Prompt", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.anthropic.response.styleBible = {
      palette: "midnight blues",
      wardrobe: {},
      artStyle: "storybook gouache",
    };

    await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "dreamy",
    });
    await ctx.workflow.drain();

    const pagePrompts = ctx.fal.imagePrompts.filter((p) => !p.includes("Neutral portrait"));
    expect(pagePrompts.length).toBeGreaterThan(0);
    expect(pagePrompts.every((p) => p.includes("storybook gouache"))).toBe(true);
    expect(pagePrompts.every((p) => p.includes("midnight blues"))).toBe(true);
  });

  it("moderates image bytes before BlobStore.put; quarantine skips storage", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.moderation.blockedImageContents = ["image-3"];

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "garden",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    const quarantined = pages.find((p) => p.generationStatus === "quarantined");
    expect(quarantined).toBeDefined();
    expect(quarantined?.illustrationBlobKey).toBeNull();

    const blobKeys = (await ctx.blobs.list(`books/${member.familyId}/`)).filter(
      (k) => k.endsWith(".png") && !k.endsWith(".raw")
    );
    expect(blobKeys).toHaveLength(11);
  });

  it("stores blob keys on Pages, never fal-hosted URLs", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "ocean",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    const readyPages = pages.filter((p) => p.generationStatus === "ready");
    expect(readyPages.every((p) => p.illustrationBlobKey?.startsWith("books/"))).toBe(
      true
    );
    expect(readyPages.every((p) => p.illustrationUrl === null)).toBe(true);
    expect(readyPages.every((p) => !p.illustrationBlobKey?.includes("example.com"))).toBe(
      true
    );
  });

  it("rejects generation without an active subscription", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-nosub", "nosub@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "NoSub",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    await expect(
      ctx.storybooks.generate(member.id, {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: "blocked",
      })
    ).rejects.toThrow(/subscription/i);
  });

  it("passes storyType to the generation pass", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);

    await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "numbers",
    });
    await ctx.workflow.drain();

    expect(ctx.anthropic.calls[0]).toMatchObject({ storyType: "learning" });
  });

  it("hard-delete removes Page illustration blobs from BlobStore", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-15del", "del15@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Del",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    const _book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "farewell",
    });
    await ctx.workflow.drain();

    const blobCountBefore = (await ctx.blobs.list(`books/${member.familyId}/`)).length;
    expect(blobCountBefore).toBeGreaterThan(0);

    await ctx.hardDelete.hardDelete(member.id);
    expect(ctx.blobs.size()).toBe(0);
  });
});
