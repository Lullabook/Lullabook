import { describe, expect, it } from "vitest";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";

/**
 * Issue 132 — PDF Export keepsake: finalized book → non-empty PDF with all
 * pages (text + images); graceful text-only PDF when images are missing
 * (text-viewable pages); user-initiated + local (no network share surface).
 */

describe("132 — PDF export keepsake", () => {
  it("exports a finalized illustrated book to a non-empty PDF containing every page", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-132a", "a@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "keepsake all pages",
    });
    ctx.storybooks.finalize(member.id, book.id);

    const pdf = await ctx.exportSvc.exportPdf(member.id, book.id);
    expect(pdf.length).toBeGreaterThan(0);
    // Every page's text is present in the PDF body.
    const pages = ctx.store.getPagesForStorybook(book.id);
    for (const p of pages) {
      expect(pdf.toString("utf-8")).toContain(p.text);
    }
  });

  it("composes a text-only PDF when every illustration is missing (text-viewable pages)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-132b", "b@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "text-only keepsake",
    });
    ctx.storybooks.finalize(member.id, book.id);

    // Strip every illustration blob — simulates a text-viewable finalized book
    // (e.g. images purged but text retained). Export must still compose a PDF.
    const pages = ctx.store.getPagesForStorybook(book.id);
    for (const p of pages) {
      if (p.illustrationBlobKey) {
        await ctx.blobs.delete(p.illustrationBlobKey);
      }
    }

    const pdf = await ctx.exportSvc.exportPdf(member.id, book.id);
    expect(pdf.length).toBeGreaterThan(0);
    // Text survives on every page even without images.
    for (const p of pages) {
      expect(pdf.toString("utf-8")).toContain(p.text);
    }
  });

  it("rejects export of a non-finalized book (no spend on a draft)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-132c", "c@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "not finalized",
    });
    // Still a draft — not finalized.
    expect(book.status).toBe("draft");

    await expect(ctx.exportSvc.exportPdf(member.id, book.id)).rejects.toThrow(/finalized/);
  });
});
