import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("05 — child safety pipeline", () => {
  it("blocks uploads that fail CSAM/safety checks", async () => {
    const ctx = createTestContext();
    const _member = ctx.onboarding.ensureFamilyForNewUser("auth-safe", "safe@example.com");
    const blocked = goodPhoto();
    ctx.moderation.blockedImages.push(blocked.length);

    await expect(
      ctx.childSafety.checkUpload(blocked, "upload-1")
    ).rejects.toThrow(/unsafe/i);

    const audit = [...ctx.store.moderationAudit.values()];
    expect(audit.some((a) => a.resourceType === "ncmec_report")).toBe(true);
  });

  it("moderates free-text brief notes before generation", async () => {
    const ctx = createTestContext();
    ctx.moderation.blockedTexts.push("badword");

    await expect(
      ctx.childSafety.checkText("includes badword here", "brief-text")
    ).rejects.toThrow(/unsafe/i);
  });

  it("quarantines generated images that fail safety classifier", async () => {
    const ctx = createTestContext();
    ctx.moderation.blockedTexts.push("unsafe-image");

    const outcome = await ctx.childSafety.checkGeneratedImage("unsafe-image-url");
    expect(outcome).toBe("quarantined");
  });

  it("supports abuse reports and account bans", () => {
    const ctx = createTestContext();
    ctx.childSafety.reportAbuse("reporter-1", "target-1", "harassment");
    ctx.childSafety.banAccount("target-1");

    expect(ctx.childSafety.isBanned("target-1")).toBe(true);
    expect(
      [...ctx.store.moderationAudit.values()].some((a) => a.resourceType === "abuse_report")
    ).toBe(true);
  });
});
