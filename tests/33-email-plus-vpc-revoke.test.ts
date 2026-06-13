import { describe, expect, it } from "vitest";
import { ConsentEngine } from "@/services/consent-engine";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { FakeNotifications } from "@/adapters/fakes";
import { createTestContext, goodPhoto } from "@/test/fixtures";

function vpcService(ctx: ReturnType<typeof createTestContext>) {
  return new EmailPlusVpcService(
    ctx.store,
    ctx.notifications,
    "http://localhost:3000"
  );
}

async function confirmEmailPlusVpc(
  ctx: ReturnType<typeof createTestContext>,
  member: { id: string; familyId: string }
) {
  ctx.subscriptions.handleRevenueCatActivated(member.familyId, "rc_sub");
  const vpc = vpcService(ctx);
  const req = vpc.requestConsent(member.id, "guardian@example.com");
  await vpc.sendConsentLink(req.id);
  const sent = ctx.store.emailPlusVpcRequests.get(req.id)!;
  const receipt = vpc.confirmConsent(sent.token);
  return { vpc, req, token: sent.token, receipt };
}

describe("33 — Email-Plus VPC revoke withdraws consent", () => {
  it("rejects a second confirm attempt (single-use token)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-33a", "a@example.com", "US_IOS");
    const { vpc, token } = await confirmEmailPlusVpc(ctx, member);

    expect(() => vpc.confirmConsent(token)).toThrow(/invalid or expired/i);
  });

  it("keeps the VPC request row as audit after confirmation", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-33b", "b@example.com", "US_IOS");
    const { req } = await confirmEmailPlusVpc(ctx, member);

    const stored = ctx.store.emailPlusVpcRequests.get(req.id);
    expect(stored?.status).toBe("confirmed");
    expect(stored?.confirmedAt).toBeInstanceOf(Date);
  });

  it("revoke clears consent_verified and blocks new Baby Persona for email_plus", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-33c", "c@example.com", "US_IOS");
    const { vpc, token } = await confirmEmailPlusVpc(ctx, member);
    expect(vpc.hasVerifiedConsent(member.familyId)).toBe(true);

    vpc.revokeConsent(token);

    expect(vpc.hasVerifiedConsent(member.familyId)).toBe(false);
    const stored = [...ctx.store.emailPlusVpcRequests.values()].find((r) => r.token === token);
    expect(stored?.status).toBe("revoked");

    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/consent receipt/i);

    const engine = new ConsentEngine();
    expect(
      engine.check({
        jurisdiction: "US_IOS",
        actorRole: "guardian",
        action: "create_baby_persona",
        hasActiveSubscription: true,
        hasConsentReceipt: false,
      }).requiredMethod
    ).toBe("email_plus");

    await expect(
      ctx.personas.createBaby({
        memberId: member.id,
        displayName: "Blocked",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      })
    ).rejects.toThrow(/consent receipt/i);
  });

  it("revoke schedules purge when baby personas exist (existing ADR-0007 path)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-33d", "d@example.com", "US_IOS");
    const { vpc, token } = await confirmEmailPlusVpc(ctx, member);

    const baby = await ctx.personas.createBaby({
      memberId: member.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    expect(baby.kind).toBe("baby");

    vpc.revokeConsent(token);
    expect(ctx.store.purgeScheduled.has(member.familyId)).toBe(true);

    const schedule = ctx.store.purgeScheduled.get(member.familyId)!;
    schedule.purgeAt = new Date(Date.now() - 1000);
    await ctx.hardDelete.runScheduledPurges();

    expect(ctx.store.personas.has(baby.id)).toBe(false);
    expect(ctx.store.familyDataExists(member.familyId)).toBe(false);
  });

  it("rejects revoke before confirmation and on already-revoked links", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-33e", "e@example.com", "US_IOS");
    ctx.subscriptions.handleRevenueCatActivated(member.familyId, "rc_sub");
    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(member.id, "guardian@example.com");
    await vpc.sendConsentLink(req.id);
    const token = ctx.store.emailPlusVpcRequests.get(req.id)!.token;

    expect(() => vpc.revokeConsent(token)).toThrow(/not yet confirmed/i);

    vpc.confirmConsent(token);
    vpc.revokeConsent(token);
    expect(() => vpc.revokeConsent(token)).toThrow(/already revoked/i);
  });
});
