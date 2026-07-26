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
    const protocolSourceKey =
      `persona-creation/${guardian.familyId}/reservation-1/attempts/attempt-1/photos/0.jpg`;
    await ctx.blobs.put(protocolSourceKey, Buffer.from("raw-source-photo"));

    // Populate maps that were historically left behind
    ctx.store.textStories.set("ts-1", { familyId: guardian.familyId } as any);
    ctx.store.pendingBriefs.set("pb-1", { memberId: guardian.id } as any);
    ctx.store.moderationAudit.set("ma-1", { resourceId: guardian.id } as any);
    ctx.store.pushSubscriptions.set("ps-1", { memberId: guardian.id } as any);
    ctx.store.emailPlusVpcRequests.set("ep-1", { familyId: guardian.familyId } as any);

    const report = await ctx.hardDelete.hardDelete(guardian.id);

    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.blobs.size()).toBe(0);
    expect(report.inventory.sourcePhotos).toBeGreaterThanOrEqual(4);
    expect(report.deleted.blobKeys).toContain(protocolSourceKey);
    await expect(ctx.hardDelete.hardDelete(guardian.id)).resolves.toMatchObject({
      deleted: { blobKeys: [] },
    });

    // Verify everything was cleared
    expect(ctx.store.textStories.size).toBe(0);
    expect(ctx.store.pendingBriefs.size).toBe(0);
    expect(ctx.store.moderationAudit.size).toBe(0);
    expect(ctx.store.pushSubscriptions.size).toBe(0);
    expect(ctx.store.emailPlusVpcRequests.size).toBe(0);
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
