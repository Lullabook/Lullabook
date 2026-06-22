import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("04 — baby persona creation", () => {
  async function subscribedGuardian(ctx: ReturnType<typeof createTestContext>) {
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian", "g@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_g", "sub_g");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    return guardian;
  }

  it("blocks non-guardians from creating baby personas", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const invite = ctx.family.inviteMember(guardian.id, "member@example.com");
    const member = ctx.family.acceptInvite(invite.token, "auth-member");

    await expect(
      ctx.personas.createBaby({
        memberId: member.id,
        displayName: "Baby",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      })
    ).rejects.toThrow(/guardian/i);
  });

  it("allows guardian to create baby persona when consent gate passes", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);

    const baby = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Emma",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(baby.kind).toBe("baby");
    expect(baby.status).toBe("ready");
  });
});
