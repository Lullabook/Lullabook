import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("12 — hard-delete & cancellation purge", () => {
  it("hard-deletes all family data from DB and blob store", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-del", "del@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_d", "sub_d");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const baby = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "ToDelete",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    await ctx.blobs.put(`lora/${guardian.familyId}/weights.bin`, Buffer.from("lora"));
    await ctx.blobs.put(`books/${guardian.familyId}/${baby.id}.png`, Buffer.from("book"));

    await ctx.hardDelete.hardDelete(guardian.id);

    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.blobs.size()).toBe(0);
  });

  it("runs automatic purge after 30-day cancel window", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-purge", "purge@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_p", "sub_p");
    ctx.subscriptions.cancel(guardian.familyId);

    const schedule = ctx.store.purgeScheduled.get(guardian.familyId)!;
    schedule.purgeAt = new Date(Date.now() - 1000);

    const purged = await ctx.hardDelete.runScheduledPurges();
    expect(purged).toContain(guardian.familyId);
    expect(ctx.hardDelete.isReadOnly(guardian.familyId)).toBe(false);
  });
});
