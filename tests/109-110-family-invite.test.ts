import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

/**
 * Issues 109 + 110 — Invite token model + email send + acceptance route +
 * onboarding-collision fix + self-persona link (ADR-0024).
 */
describe("109/110 — invite token model + acceptance", () => {
  it("mints an invite with an opaque token, expiry, fixed role, and pending status", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-109", "g@example.com");
    const { inviteId, token } = ctx.family.inviteMember(guardian.id, "grandma@example.com");

    expect(token).toBeTruthy();
    expect(token).not.toBe(inviteId); // opaque, distinct from PK

    const invite = ctx.store.invites.get(inviteId)!;
    expect(invite.role).toBe("member"); // fixed, never attacker-chosen
    expect(invite.status).toBe("pending");
    expect(invite.expiresAt).toBeInstanceOf(Date);
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("sends an invite email via the notification adapter", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-109e", "g@example.com");
    ctx.family.inviteMember(guardian.id, "grandma@example.com");

    const email = ctx.notifications.emails.find((e) => e.to === "grandma@example.com");
    expect(email).toBeDefined();
    expect(email!.subject).toContain("invited");
  });

  it("rejects invites from non-guardians", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-109g", "g@example.com");
    const { token } = ctx.family.inviteMember(guardian.id, "non@example.com");
    const nonGuardian = ctx.family.acceptInvite(token, "auth-non");

    expect(() => ctx.family.inviteMember(nonGuardian.id, "x@example.com")).toThrow(/guardian/i);
  });

  it("accepting a valid token makes the invitee a non-Guardian Member of the inviter's Household", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-110a", "g@example.com");
    const { token } = ctx.family.inviteMember(guardian.id, "grandma@example.com");
    const grandma = ctx.family.acceptInvite(token, "auth-grandma");

    expect(grandma.familyId).toBe(guardian.familyId);
    expect(grandma.role).toBe("member"); // non-Guardian
    expect(grandma.email).toBe("grandma@example.com");
  });

  it("expired tokens are rejected", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-110b", "g@example.com");
    const { inviteId, token } = ctx.family.inviteMember(guardian.id, "late@example.com");
    // Manually expire the invite
    const invite = ctx.store.invites.get(inviteId)!;
    invite.expiresAt = new Date(Date.now() - 1);
    ctx.store.invites.set(inviteId, invite);

    expect(() => ctx.family.acceptInvite(token, "auth-late")).toThrow(/expired/i);
  });

  it("used tokens are rejected (single-use)", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-110c", "g@example.com");
    const { token } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    ctx.family.acceptInvite(token, "auth-gma");

    // Second accept with the same token → rejected
    expect(() => ctx.family.acceptInvite(token, "auth-other")).toThrow(/used/i);
  });

  it("forged tokens are rejected", () => {
    const ctx = createTestContext();
    expect(() => ctx.family.acceptInvite("forged-token-xyz", "auth-attacker")).toThrow(/not found/i);
  });

  it("accepted Member sees only their Household — cross-family read throws RlsViolationError", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-110d", "g@example.com");
    const { token } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    const grandma = ctx.family.acceptInvite(token, "auth-gma");

    // Guardian creates a storybook in the shared Household
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    // Grandma can see her own Household's personas (shared)
    const sharedPersona = ctx.store.getPersona(persona.id, grandma.id);
    expect(sharedPersona).toBeDefined();

    // A different family's guardian can't see the same persona (RLS)
    const otherGuardian = ctx.onboarding.ensureFamilyForNewUser("auth-other-fam", "o@example.com");
    expect(() => ctx.store.getPersona(persona.id, otherGuardian.id)).toThrow(/family/i);
  });

  it("accept is idempotent — accepting twice with the same auth user returns the same Member", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-110e", "g@example.com");
    const { token } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    const grandma1 = ctx.family.acceptInvite(token, "auth-gma");

    // The invite is already accepted, so a second call with the same auth user
    // should return the existing member (not throw, not create a duplicate).
    const grandma2 = ctx.family.acceptInvite(token, "auth-gma");
    expect(grandma2.id).toBe(grandma1.id);
  });
});
