import { describe, expect, it } from "vitest";
import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import {
  createTestContext,
  goodPhoto,
  subscribedGuardian,
} from "@/test/fixtures";

/**
 * Issue 126 — R1 end-to-end smoke (deterministic service-level tracer bullet).
 *
 * The Playwright spec (e2e/r1-smoke.spec.ts) exercises the live dev server;
 * this test pins the same R1 loop invariants deterministically against the
 * in-memory context with DEV_FAL_FALLBACK — no live keys, no server, no flake.
 * It is the R1 done-signal at the service seam: create baby + family → generate
 * a Bedtime book → assert an illustrated `draft` (terminal, < 500KB payload) →
 * export a non-empty PDF keepsake.
 */

describe("126 — R1 end-to-end smoke (deterministic, DEV_FAL_FALLBACK)", () => {
  it("runs the full R1 loop: baby+family → illustrated draft → PDF export", async () => {
    const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });
    const guardian = await subscribedGuardian(ctx);

    // 1. Create a Baby Persona (consent already recorded by subscribedGuardian).
    const babyPersona = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    expect(babyPersona.status).toBe("ready");
    ctx.personas.acceptLikeness(babyPersona.id, guardian.id);

    // 2. Add an Adult Persona to the family roster (solo Guardian + baby cast).
    const adult = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Mama",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: adult.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "my star",
    });

    // 3. Generate a Bedtime book (the R1 story type).
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "A cozy bedtime under Maya's stars",
    });
    await ctx.workflow.drain();
    const finalBook = ctx.store.getStorybook(book.id, guardian.id)!;

    // 4. Terminal state — never stranded in "generating".
    expect(["draft", "failed"]).toContain(finalBook.status);
    expect(finalBook.status).toBe("draft");

    // 5. Illustrated draft — every page carries a stored illustration blob.
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((p) => p.generationStatus === "ready")).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);

    // 6. Payload invariant: illustrations are blob keys (signed URLs on read),
    //    never inline base64. The stored Page record carries no image bytes.
    for (const p of pages) {
      expect(typeof p.illustrationBlobKey).toBe("string");
      expect(p.illustrationUrl).toBe(null);
      // Detail payload < 500KB — the page text + keys are well under; the
      // illustration bytes live in blob storage, not the detail payload.
      const pageJson = JSON.stringify(p);
      expect(Buffer.byteLength(pageJson)).toBeLessThan(500 * 1024);
    }

    // 7. Finalize + export a non-empty PDF keepsake (the only likeness-egress path).
    ctx.storybooks.finalize(guardian.id, book.id);
    const pdf = await ctx.exportSvc.exportPdf(guardian.id, book.id);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.toString("utf-8")).toContain("A cozy bedtime under Maya's stars");
  });

  it("book reaches a terminal state within the 5-min watchdog budget (never infinite Illustrating)", async () => {
    const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });
    const guardian = await subscribedGuardian(ctx);
    const babyPersona = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    ctx.personas.acceptLikeness(babyPersona.id, guardian.id);
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "watchdog",
    });
    await ctx.workflow.drain();
    const finalBook = ctx.store.getStorybook(book.id, guardian.id)!;

    // Terminal state reached synchronously (inline dev workflow) — well within
    // the 5-min watchdog. The watchdog reaper confirms no `generating` remains.
    expect(finalBook.status).not.toBe("generating");
    const reaped = ctx.storybooks.reapStrandedGenerations(
      new Date(Date.now() + 6 * 60 * 1000)
    );
    expect(reaped).toBe(0); // already terminal — nothing to reap
  });
});
