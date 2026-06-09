import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("11 — family invites & multi-member", () => {
  it("lets guardians invite and remove members", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-inv", "inv@example.com");
    const { inviteId: firstInvite } = ctx.family.inviteMember(guardian.id, "non@example.com");
    const nonGuardian = ctx.family.acceptInvite(firstInvite, "auth-non");

    expect(() => ctx.family.inviteMember(nonGuardian.id, "x@example.com")).toThrow(/guardian/i);

    const { inviteId } = ctx.family.inviteMember(guardian.id, "grandma@example.com");
    const grandma = ctx.family.acceptInvite(inviteId, "auth-grandma");
    expect(grandma.familyId).toBe(guardian.familyId);

    ctx.family.removeMember(guardian.id, grandma.id);
    expect(ctx.store.members.get(grandma.id)).toBeUndefined();
  });

  it("links self persona and defaults brief starring", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-self", "self@example.com");
    const { inviteId } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    const grandma = ctx.family.acceptInvite(inviteId, "auth-gma");

    const self = await ctx.personas.createAdult({
      memberId: grandma.id,
      displayName: "Grandma",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    ctx.family.linkSelfPersona(grandma.id, self.id);

    const brief = ctx.family.defaultBriefStarring(grandma.id, [self.id]);
    expect(brief.starringPersonaIds[0]).toBe(self.id);
  });
});
