import { describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

describe("09 — export PDF", () => {
  it("exports a finalized storybook as PDF", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-export", "export@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Exporter",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "keepsake",
    });
    ctx.storybooks.finalize(member.id, book.id);

    const pdf = await ctx.exportSvc.exportPdf(member.id, book.id);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.toString("utf-8")).toContain("keepsake");
  });

  it("allows export even when subscription is canceled", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-exp2", "exp2@example.com");
    ctx.subscriptions.handleCheckoutCompleted(member.familyId, "cus_e", "sub_e");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Keeper",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "memory",
    });
    ctx.storybooks.finalize(member.id, book.id);
    ctx.subscriptions.cancel(member.familyId);

    const pdf = await ctx.exportSvc.exportPdf(member.id, book.id);
    expect(pdf.length).toBeGreaterThan(0);
  });
});
