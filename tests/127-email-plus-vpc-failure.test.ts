import { describe, expect, it } from "vitest";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { createTestContext, goodPhoto } from "@/test/fixtures";

/**
 * Issue 127 — Email-Plus VPC: the remaining R1 gap.
 *
 * The core flow (single-use token, notice-versioned receipt, revoke → purge)
 * is covered by test 33. This pins the two invariants the audit flagged as
 * untested: (a) email-send failure → consent NOT granted, retryable; (b) the
 * consent receipt carries who/when/notice-version.
 */

function vpcService(ctx: ReturnType<typeof createTestContext>) {
  return new EmailPlusVpcService(ctx.store, ctx.notifications, "http://localhost:3000");
}

describe("127 — Email-Plus VPC failure + receipt audit", () => {
  it("email-send failure does NOT grant consent; the request stays retryable", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-127a", "a@example.com", "US_IOS");
    ctx.subscriptions.handleRevenueCatActivated(member.familyId, "rc_sub");

    // Force the email send to fail.
    ctx.notifications.failEmail = true;
    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(member.id, "guardian@example.com");

    await expect(vpc.sendConsentLink(req.id)).rejects.toThrow(/email/i);
    ctx.notifications.failEmail = false;

    // The request never reached link_sent → the token cannot be confirmed.
    const stored = ctx.store.emailPlusVpcRequests.get(req.id)!;
    expect(stored.status).toBe("requested");
    expect(() => vpc.confirmConsent(stored.token)).toThrow(/invalid or expired/i);
    expect(vpc.hasVerifiedConsent(member.familyId)).toBe(false);

    // Retryable: a fresh send succeeds and the flow completes.
    await vpc.sendConsentLink(req.id);
    const after = ctx.store.emailPlusVpcRequests.get(req.id)!;
    expect(after.status).toBe("link_sent");
    const receipt = vpc.confirmConsent(after.token);
    expect(receipt.noticeVersion).toBe("us-coppa-v1");
  });

  it("the consent receipt records who consented, when, and the notice version", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-127b", "b@example.com", "US_IOS");
    ctx.subscriptions.handleRevenueCatActivated(member.familyId, "rc_sub");
    const vpc = vpcService(ctx);

    const req = vpc.requestConsent(member.id, "guardian@example.com");
    await vpc.sendConsentLink(req.id);
    const sent = ctx.store.emailPlusVpcRequests.get(req.id)!;
    const before = new Date();
    const receipt = vpc.confirmConsent(sent.token);
    const after = new Date();

    expect(receipt.familyId).toBe(member.familyId);
    expect(receipt.memberId).toBe(member.id);
    expect(receipt.jurisdiction).toBe("US_IOS");
    expect(receipt.noticeVersion).toBe("us-coppa-v1");
    expect(receipt.consentedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(receipt.consentedAt.getTime()).toBeLessThanOrEqual(after.getTime());

    // Baby Persona creation is now unblocked (consent receipt on file).
    const baby = await ctx.personas.createBaby({
      memberId: member.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    expect(baby.kind).toBe("baby");
  });
});
