import { describe, expect, it } from "vitest";
import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import { generateRealBedtimeBook } from "@/dev/seed-maya-world";

/**
 * Issue 124 — Honest DEV_DEMO_SEED.
 *
 * The runtime seed (`seedMayaWorldRuntime`) wrote page-less display rows —
 * books with no text and no images — so the demo looked empty. The fix drives
 * the REAL pipeline (Claude text + DEV_FAL_FALLBACK placeholder images) for one
 * Bedtime book, so the seeded world carries a genuine illustrated `draft`.
 *
 * These tests pin the helper against the in-memory test context with the
 * DevFalFallbackAdapter (the same adapter the dev runtime selects under
 * DEV_FAL_FALLBACK). The runtime additionally uses real Claude for text; here
 * the fake stands in so the test is deterministic + key-free.
 */

async function setupBaby() {
  const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });
  const guardian = await subscribedGuardian(ctx);
  const babyPersona = await ctx.personas.createBaby({
    memberId: guardian.id,
    displayName: "Maya",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
  });
  // Issue 125: confirm likeness before generating (the gate the seed's
  // direct-write persona skips in the runtime, but a created persona respects).
  ctx.personas.acceptLikeness(babyPersona.id, guardian.id);
  const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
  return { ctx, guardian, babyPersona, baby };
}

describe("124 — DEV_DEMO_SEED honest book (real text + images, not empty rows)", () => {
  it("generates a Bedtime book with real text + illustration blobs + terminal state", async () => {
    const { ctx, guardian, babyPersona, baby } = await setupBaby();

    const book = await generateRealBedtimeBook(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "A cozy bedtime under the stars",
    });

    // Terminal state — never stranded in "generating".
    expect(["draft", "failed"]).toContain(book.status);
    expect(book.status).toBe("draft");

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.length).toBeGreaterThan(0);
    // Real text on every page (not empty display rows).
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
    // Real illustration blob on every page (illustrated, not text-only).
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);
    for (const p of pages) {
      const blob = await ctx.blobs.get(p.illustrationBlobKey!);
      expect(blob).not.toBeNull();
    }
  });

  it("keeps the payload small — illustrations are blob keys, never inline base64", async () => {
    const { ctx, guardian, babyPersona, baby } = await setupBaby();

    const book = await generateRealBedtimeBook(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "small payload",
    });

    const pages = ctx.store.getPagesForStorybook(book.id);
    // illustrationBlobKey is a string key (signed URL resolved on read), and
    // illustrationUrl is null on the stored record — no inline base64 bloat.
    expect(pages.every((p) => typeof p.illustrationBlobKey === "string")).toBe(true);
    expect(pages.every((p) => p.illustrationUrl === null)).toBe(true);
  });
});
