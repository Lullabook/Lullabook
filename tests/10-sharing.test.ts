import { describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("10 — sharing", () => {
  async function finalizedBook(ctx: ReturnType<typeof createTestContext>) {
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-share", "share@example.com");
    withActiveSubscription(ctx, guardian);
    const invite = ctx.family.inviteMember(guardian.id, "fam@example.com");
    const other = ctx.family.acceptInvite(invite.inviteId, "auth-fam");
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "birthday",
    });
    ctx.storybooks.finalize(guardian.id, book.id);
    return { guardian, other, book };
  }

  it("lets all family members view finalized storybooks", async () => {
    const ctx = createTestContext();
    const { other, book } = await finalizedBook(ctx);
    expect(ctx.sharing.canViewStorybook(other.id, book.id)).toBe(true);
  });

  it("mints revocable share links with noindex headers and warning", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await finalizedBook(ctx);

    const { url, warning, link } = ctx.sharing.mintShareLink(guardian.id, book.id, {
      passcode: "secret",
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    expect(warning).toMatch(/likeness/i);
    expect(url).toMatch(/^\/share\//);
    expect(ctx.sharing.shareLinkHeaders()["X-Robots-Tag"]).toContain("noindex");

    const accessed = ctx.sharing.accessViaShareLink(link.token, "secret");
    expect(accessed?.id).toBe(book.id);

    ctx.sharing.revokeShareLink(guardian.id, link.id);
    expect(ctx.sharing.accessViaShareLink(link.token, "secret")).toBeNull();
  });
});
