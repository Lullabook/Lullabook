import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("11 — family invites & multi-member", () => {
  it("lets guardians invite and remove members", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-inv", "inv@example.com");
    const { token: firstToken } = ctx.family.inviteMember(guardian.id, "non@example.com");
    const nonGuardian = ctx.family.acceptInvite(firstToken, "auth-non");

    expect(() => ctx.family.inviteMember(nonGuardian.id, "x@example.com")).toThrow(/guardian/i);

    const { token } = ctx.family.inviteMember(guardian.id, "grandma@example.com");
    const grandma = ctx.family.acceptInvite(token, "auth-grandma");
    expect(grandma.familyId).toBe(guardian.familyId);

    ctx.family.removeMember(guardian.id, grandma.id);
    expect(ctx.store.members.get(grandma.id)).toBeUndefined();
  });

  it("does not let an invited Member create or link a self Persona in R1", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-self", "self@example.com");
    const { token } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    const grandma = ctx.family.acceptInvite(token, "auth-gma");

    await expect(ctx.personas.createAdult({
      memberId: grandma.id,
      displayName: "Grandma",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    })).rejects.toThrow(/guardian/i);
    expect(grandma.selfPersonaId).toBeNull();
    expect(ctx.store.personas.size).toBe(0);
  });
});
