import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFal } from "@/adapters/fakes";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { ConsentRequiredError } from "@/services/subscription";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 172 — consent gate on createBaby (COPPA launch blocker, ADR-0018).
 *
 * The hole: ConsentReceipt was method-blind, so a payment-derived receipt
 * (Stripe webhook / web self-serve action) satisfied EVERY jurisdiction —
 * including US_IOS where Apple's rules require email_plus VPC. A mobile
 * guardian could pay, upload baby photos, and start a LoRA train with no
 * verified parental consent.
 *
 * The fix: receipts carry `method`; a receipt only satisfies consent when
 * its method matches the jurisdiction's required method. Payment does not
 * satisfy consent, consent does not satisfy payment (orthogonal). Denials
 * cross the wire as structured 403 `consent_required`, and consent-store
 * read errors fail CLOSED (SEC-4).
 */

function vpcService(ctx: ReturnType<typeof createTestContext>) {
  return new EmailPlusVpcService(ctx.store, ctx.notifications, "http://localhost:3000");
}

function babyInput(memberId: string) {
  return {
    memberId,
    displayName: "Luna",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
  };
}

describe("172 — consent gate on createBaby", () => {
  it("CLOSES THE HOLE: a payment receipt does not satisfy email_plus (US_IOS)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172a", "a@example.com", "US_IOS");
    withActiveSubscription(ctx, member);
    // Payment-derived consent, exactly what the Stripe webhook records.
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction, "payment_vpc");

    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("consent_required");

    await expect(ctx.personas.createBaby(babyInput(member.id))).rejects.toMatchObject({
      name: "ConsentRequiredError",
      status: 403,
      code: "consent_required",
    });

    // No partial writes: no persona row, no training started.
    expect(ctx.store.personas.size).toBe(0);
    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("legacy receipts without a method fail closed in email_plus markets", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172b", "b@example.com", "US_IOS");
    withActiveSubscription(ctx, member);
    // Pre-172 receipt shape: no method field at all.
    ctx.store.saveConsentReceipt({
      id: "legacy-receipt",
      familyId: member.familyId,
      memberId: member.id,
      jurisdiction: member.jurisdiction,
      noticeVersion: "v1",
      consentedAt: new Date(),
    });

    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("consent_required");
  });

  it("email_plus VPC confirmation DOES satisfy US_IOS and createBaby proceeds", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172c", "c@example.com", "US_IOS");
    withActiveSubscription(ctx, member);

    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(member.id, "guardian@example.com");
    await vpc.sendConsentLink(req.id);
    const token = ctx.store.emailPlusVpcRequests.get(req.id)!.token;
    const receipt = vpc.confirmConsent(token);
    expect(receipt.method).toBe("email_plus");

    expect(ctx.subscriptions.canCreateBabyPersona(member.id).allowed).toBe(true);
    const persona = await ctx.personas.createBaby(babyInput(member.id));
    expect(persona.kind).toBe("baby");
    expect(() => ctx.subscriptions.requireConsentVerified(member.familyId)).not.toThrow();
  });

  it("US web is unchanged: payment_vpc receipt satisfies the US jurisdiction", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172d", "d@example.com", "US");
    withActiveSubscription(ctx, member);
    ctx.subscriptions.recordConsent(member.familyId, member.id, "US", "payment_vpc");

    expect(ctx.subscriptions.canCreateBabyPersona(member.id).allowed).toBe(true);
  });

  it("orthogonality: verified consent without a subscription routes to paywall, not consent", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172e", "e@example.com", "US_IOS");
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction); // email_plus default

    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/subscription/i);
    expect(gate.code).toBeUndefined(); // paywall path — NOT consent_required
  });

  it("SEC-4: a consent-store read error denies (fail closed), never allows", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172f", "f@example.com", "US");
    withActiveSubscription(ctx, member);
    ctx.subscriptions.recordConsent(member.familyId, member.id, "US", "payment_vpc");

    vi.spyOn(ctx.store, "getConsentReceiptForFamily").mockImplementation(() => {
      throw new Error("db down");
    });

    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("consent_required");
    await expect(ctx.personas.createBaby(babyInput(member.id))).rejects.toBeInstanceOf(
      ConsentRequiredError
    );
    expect(() => ctx.subscriptions.requireConsentVerified(member.familyId)).toThrow(
      ConsentRequiredError
    );
    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("adult persona creation is unaffected by the consent gate", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172g", "g@example.com", "US_IOS");
    withActiveSubscription(ctx, member);
    // No consent receipt of any kind — adults are their own consent authority.
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Dad",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: goodPhoto(),
    });
    expect(persona.kind).toBe("adult");
  });
});

// ---------------------------------------------------------------------------
// Route-level: the denial crosses the wire as structured 403 consent_required
// ---------------------------------------------------------------------------

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "auth-172-route",
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => harness.ctx!,
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async (token: string) => {
      if (token === "bad") throw new Error("invalid");
      return {
        sub: harness.authSub,
        email: `${harness.authSub}@example.com`,
        jurisdiction: "US_IOS",
      };
    },
  }),
}));

import { POST } from "@/app/api/personas/route";

describe("172 — POST /api/personas baby denial is structured", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
  });

  it("returns 403 {code:'consent_required'} and stages nothing", async () => {
    const ctx = harness.ctx!;
    const member = ctx.onboarding.ensureFamilyForNewUser(
      harness.authSub,
      `${harness.authSub}@example.com`,
      "US_IOS"
    );
    withActiveSubscription(ctx, member);
    // Payment consent only — must NOT unlock baby creation on US_IOS.
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction, "payment_vpc");
    const workflowSpy = vi.spyOn(ctx.workflow, "requestPersonaCreate");

    const form = new FormData();
    form.set("mode", "baby");
    form.set("displayName", "Luna");
    for (let i = 0; i < 3; i++) {
      form.append(
        "photos",
        new File([Uint8Array.from(goodPhoto())], `p${i}.jpg`, { type: "image/jpeg" })
      );
    }

    const res = await POST(
      new Request("http://localhost/api/personas", {
        method: "POST",
        headers: { Authorization: "Bearer good" },
        body: form,
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("consent_required");
    expect(body.error).toMatch(/consent/i);
    // Gate runs before staging: nothing queued, nothing trained.
    expect(workflowSpy).not.toHaveBeenCalled();
    expect((ctx.fal as FakeFal).trainCalls).toBe(0);
  });
});
