import { describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, goodPhoto } from "@/test/fixtures";
import { rosterAvatarBlobKey } from "@/lib/roster-avatar";

describe("58 — roster avatar web (ADR-0020)", () => {
  it("generates avatarKey on ready after training", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-avatar", "avatar@example.com");

    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Mom",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(persona.status).toBe("ready");
    // Ticket 180: avatar keys are generation-scoped (retraining must mint a
    // distinct owned key), so assert the Family-owned prefix rather than one
    // exact deterministic key.
    expect(persona.avatarKey).toMatch(
      new RegExp(`^avatars/${member.familyId}/${persona.id}/.+\\.png$`)
    );
    expect(await ctx.blobs.get(persona.avatarKey!)).not.toBeNull();
    expect(ctx.fal.avatarImageCalls).toBeGreaterThan(0);
  });

  it("shows placeholder samples while training (no avatarKey)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-training", "train@example.com");
    ctx.store.savePersona({
      id: "p-training",
      familyId: member.familyId,
      createdByMemberId: member.id,
      kind: "adult",
      displayName: "Training",
      status: "training",
      loraWeightKey: null,
      avatarKey: null,
      createdAt: new Date(),
    });
    expect(ctx.personas.getLikenessSamples("p-training", member.id)).toEqual([]);
  });

  it("resolves likeness samples from avatarKey when ready", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-like2", "like2@example.com");
    const persona = await createReadyAdult(ctx, guardian, "Aunt");
    const key = rosterAvatarBlobKey(guardian.familyId, persona.id);
    persona.avatarKey = key;
    await ctx.blobs.put(key, Buffer.from("avatar"));
    ctx.store.savePersona(persona);

    const samples = ctx.personas.getLikenessSamples(persona.id, guardian.id);
    // Ticket 180: ready Personas expose their generated review samples
    // (dedicated likeness-sample derivatives; the roster avatar is separate).
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample).toMatch(/likeness-samples\?key=/);
      expect(sample).not.toContain("photos%2F");
    }
  });

  it("purges avatar blob on hard-delete", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-purge", "purge@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Dad",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    expect(persona.avatarKey).toBeTruthy();
    await ctx.hardDelete.hardDelete(member.id);
    expect(await ctx.blobs.get(persona.avatarKey!)).toBeNull();
  });
});
