import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("07 — curate draft", () => {
  async function draftBook(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-curate", "curate@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Hero",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "kindness",
    });
    const page = ctx.store.getPagesForStorybook(book.id)[0];
    return { member, book, page };
  }

  it("re-rolls image independently from text", async () => {
    const ctx = createTestContext();
    const { member, book, page } = await draftBook(ctx);
    const originalText = page.text;

    ctx.storybooks.rerollImage(member.id, page.id);
    const imageCandidates = ctx.store
      .getCandidatesForPage(page.id)
      .filter((c) => c.kind === "image");
    expect(imageCandidates).toHaveLength(1);
    expect(ctx.store.pages.get(page.id)?.text).toBe(originalText);
    expect(book.rerollBudgetRemaining).toBe(4);
  });

  it("re-rolls text independently from image", async () => {
    const ctx = createTestContext();
    const { member, page } = await draftBook(ctx);

    ctx.storybooks.rerollText(member.id, page.id, "New page text");
    const textCandidates = ctx.store
      .getCandidatesForPage(page.id)
      .filter((c) => c.kind === "text");
    expect(textCandidates).toHaveLength(1);
  });

  it("requires credits after free re-roll budget is exhausted", async () => {
    const ctx = createTestContext();
    const { member, book, page } = await draftBook(ctx);
    book.rerollBudgetRemaining = 0;
    book.rerollCredits = 0;
    ctx.store.saveStorybook(book);

    expect(() => ctx.storybooks.rerollImage(member.id, page.id)).toThrow(/budget/i);

    ctx.storybooks.buyRerollCredits(member.id, book.id, 1);
    ctx.storybooks.rerollImage(member.id, page.id);
    expect(ctx.store.getStorybook(book.id, member.id)?.rerollCredits).toBe(0);
  });

  it("finalizes draft and hides draft from other family members", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-fin", "fin@example.com");
    withActiveSubscription(ctx, guardian);
    const invite = ctx.family.inviteMember(guardian.id, "other@example.com");
    const other = ctx.family.acceptInvite(invite.inviteId, "auth-other");

    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "P1",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "sharing",
    });

    expect(() => ctx.store.getStorybook(book.id, other.id)).toThrow(RlsViolationError);

    const finalized = ctx.storybooks.finalize(guardian.id, book.id);
    expect(finalized.status).toBe("finalized");
    expect(ctx.store.getStorybook(book.id, other.id)?.status).toBe("finalized");
  });
});
