import { describe, expect, it } from "vitest";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  householdWithBaby,
} from "@/test/fixtures";

/**
 * Issue 133 — Moderation fails CLOSED on the shipping path.
 *
 * Upload + text moderation + CSAM are covered by 05 + real-adapters. This pins
 * the R1 gap: when the moderation service is UNAVAILABLE on the **generation**
 * path, the page fails closed (lands `failed`, never `allowed`), so no child
 * likeness is generated from a photo that bypassed safety.
 */

describe("133 — moderation fails closed on the generation path", () => {
  it("a moderation outage marks every page failed — no likeness is allowed through", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx);

    // Sabotage the generated-image moderation so it throws (service down).
    ctx.moderation.failChecks = true;

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "moderation outage",
    });

    // Book still reaches a terminal state (text-viewable draft, issue 102) —
    // never infinite "Illustrating" — but NO illustration is allowed through.
    expect(["draft", "failed"]).toContain(book.status);
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.length).toBeGreaterThan(0);
    // Every page failed moderation → none stored an illustration.
    expect(pages.every((p) => p.generationStatus === "failed")).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey === null)).toBe(true);
    for (const p of pages) {
      if (p.illustrationBlobKey) {
        const blob = await ctx.blobs.get(p.illustrationBlobKey);
        expect(blob).toBeNull();
      }
    }
  });

  it("an uploaded photo that fails safety never reaches training (fail closed at upload)", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-133b", "b@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_b", "sub_b");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const unsafe = goodPhoto();
    ctx.moderation.blockedImages.push(unsafe.length);

    await expect(
      ctx.personas.createBaby({
        memberId: guardian.id,
        displayName: "Blocked",
        photos: [unsafe, unsafe, unsafe],
      })
    ).rejects.toThrow(/unsafe/i);

    // No persona was created — the upload gate fired before any training spend.
    expect([...ctx.store.personas.values()].filter((p) => p.familyId === guardian.familyId)).toHaveLength(0);
  });
});
