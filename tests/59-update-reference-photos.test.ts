import { describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, goodPhoto } from "@/test/fixtures";
import { rosterAvatarBlobKey } from "@/lib/roster-avatar";

describe("59 — update reference photos → retrain → regenerate avatar", () => {
  it("replacePhotos re-enters training, clears avatar, then regenerates on ready", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-replace", "replace@example.com");
    member.selfPersonaId = null;
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Me",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const firstKey = persona.avatarKey!;
    expect(firstKey).toBeTruthy();

    const firstBytes = await ctx.blobs.get(firstKey);

    const updated = await ctx.personas.replacePhotos({
      personaId: persona.id,
      memberId: member.id,
      photos: [goodPhoto(1), goodPhoto(2), goodPhoto(3)],
      selfie: Buffer.from("selfie2"),
    });

    expect(updated.status).toBe("ready");
    expect(updated.avatarKey).toBeTruthy();
    // Ticket 180: retraining mints a generation-scoped owned key (never
    // reuses the pre-retrain avatar key, which caches could still serve).
    // Compare against firstKey — `persona` is mutated in place by the service.
    expect(updated.avatarKey).toMatch(
      new RegExp(`^avatars/${member.familyId}/${persona.id}/.+\\.png$`)
    );
    expect(updated.avatarKey).not.toBe(firstKey);
    expect(ctx.fal.avatarImageCalls).toBeGreaterThanOrEqual(1);
    expect(await ctx.blobs.get(updated.avatarKey!)).not.toBeNull();
  });

  it("enforces self-only replace for adult personas", async () => {
    const ctx = createTestContext();
    const owner = ctx.onboarding.ensureFamilyForNewUser("auth-owner", "owner@example.com");
    const spouseEmail = "spouse@example.com";
    const { token: inviteToken } = ctx.family.inviteMember(owner.id, spouseEmail);
    const spouse = ctx.family.acceptInvite(inviteToken, "auth-spouse");
    const persona = await createReadyAdult(ctx, owner, "Owner");

    await expect(
      ctx.personas.replacePhotos({
        personaId: persona.id,
        memberId: spouse.id,
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/themself/i);
  });
});
