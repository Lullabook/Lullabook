import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

/**
 * Issue 134 — Hard-delete always available + consent-revoke → purge.
 *
 * Hard-delete across every store (test 12) + revoke→purge (test 33) are
 * covered. This pins the R1 gap: hard-delete is **always available to the
 * Guardian, never gated by subscription state** (the "right to be forgotten"
 * survives cancellation/non-payment).
 */

describe("134 — hard-delete is always available (never subscription-gated)", () => {
  it("a Guardian with NO subscription can still hard-delete their data", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-134a", "a@example.com");
    // No subscription at all.
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);

    // Seed some data directly (no subscription needed to hold data).
    await ctx.blobs.put(`photos/${guardian.familyId}/1.jpg`, goodPhoto());
    ctx.store.textStories.set("ts-134", { familyId: guardian.familyId } as never);

    // Hard-delete is available and completes — never gated.
    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.blobs.size()).toBe(0);
  });

  it("a Guardian with a CANCELED subscription can still hard-delete", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-134b", "b@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_b", "sub_b");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const baby = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    await ctx.blobs.put(`books/${guardian.familyId}/${baby.id}.png`, Buffer.from("book"));

    // Cancel the subscription — then hard-delete must still work.
    ctx.subscriptions.cancel(guardian.familyId);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);

    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.blobs.size()).toBe(0);
    expect(ctx.store.personas.has(baby.id)).toBe(false);
  });

  it("hard-delete erases child data across every store — nothing remains", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-134c", "c@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_c", "sub_c");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const baby = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    // Photos, LoRA weights, a generated book, moderation audit, VPC request.
    await ctx.blobs.put(`photos/${baby.id}/0.jpg`, goodPhoto());
    await ctx.blobs.put(`lora/${guardian.familyId}/weights.bin`, Buffer.from("lora"));
    await ctx.blobs.put(`books/${guardian.familyId}/book-1.png`, Buffer.from("book"));
    ctx.store.moderationAudit.set("ma-134", { resourceId: guardian.id } as never);
    ctx.store.emailPlusVpcRequests.set("ep-134", { familyId: guardian.familyId } as never);

    await ctx.hardDelete.hardDelete(guardian.id);

    // DB stores
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.store.personas.has(baby.id)).toBe(false);
    expect(ctx.store.moderationAudit.size).toBe(0);
    expect(ctx.store.emailPlusVpcRequests.size).toBe(0);
    // Blob store (photos + LoRA + books)
    expect(ctx.blobs.size()).toBe(0);
    const remaining = await ctx.blobs.list(`photos/${baby.id}/`);
    expect(remaining).toHaveLength(0);
  });
});
