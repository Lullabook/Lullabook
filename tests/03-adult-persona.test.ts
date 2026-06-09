import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("03 — adult persona creation", () => {
  it("rejects selfie mismatch", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-adult", "adult@example.com");
    ctx.liveness.shouldMatch = false;

    await expect(
      ctx.personas.createAdult({
        memberId: member.id,
        displayName: "Mom",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/selfie/i);
  });

  it("rejects unusable photos before trainer is called", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-preflight", "pf@example.com");

    const badPhoto = goodPhoto(0x00);

    await expect(
      ctx.personas.createAdult({
        memberId: member.id,
        displayName: "Dad",
        photos: [badPhoto, goodPhoto(), goodPhoto()],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/pre-flight/i);

    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("transitions persona to ready after training webhook", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-train", "train@example.com");

    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Aunt",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(persona.status).toBe("ready");
    expect(ctx.workflow.steps).toContain("wait-for-training");
  });

  it("shows likeness confirmation samples on ready", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-like", "like@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Uncle",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    const samples = ctx.personas.getLikenessSamples(persona.id, member.id);
    expect(samples.length).toBeGreaterThan(0);
    expect(ctx.personas.acceptLikeness(persona.id, member.id).status).toBe("ready");
  });
});
