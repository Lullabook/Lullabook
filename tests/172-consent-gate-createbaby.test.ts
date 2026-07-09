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

// ---------------------------------------------------------------------------
// Red-team regressions (172 audit): multi-receipt, method-blind status,
// client-controlled jurisdiction, consent-link TTL.
// ---------------------------------------------------------------------------

import { GET as consentStatusGET } from "@/app/api/consent/email-plus/status/route";
import { requireBearerMember } from "@/lib/bearer-auth";

function statusRequest() {
  return new Request("http://localhost/api/consent/email-plus/status", {
    headers: { Authorization: "Bearer good" },
  });
}

describe("172 red-team — receipt selection is method-aware across MULTIPLE receipts", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
  });

  it("payment receipt first, email_plus second: verified family is NOT bricked", async () => {
    const ctx = harness.ctx!;
    const member = ctx.onboarding.ensureFamilyForNewUser(
      harness.authSub,
      `${harness.authSub}@example.com`,
      "US_IOS"
    );
    withActiveSubscription(ctx, member);
    // 1) Stripe webhook lands first and records payment_vpc.
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction, "payment_vpc");
    expect(ctx.subscriptions.canCreateBabyPersona(member.id).allowed).toBe(false);

    // 2) Guardian then completes the REAL email_plus flow.
    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(member.id, "guardian@example.com");
    await vpc.sendConsentLink(req.id);
    vpc.confirmConsent(req.token);

    // First-receipt-wins would still return the payment receipt and deny.
    expect(ctx.store.consentReceipts.size).toBe(2);
    expect(ctx.subscriptions.canCreateBabyPersona(member.id).allowed).toBe(true);
    await expect(ctx.personas.createBaby(babyInput(member.id))).resolves.toMatchObject({
      kind: "baby",
    });
  });

  it("status route is method-aware: payment receipt alone is not 'verified' on US_IOS", async () => {
    const ctx = harness.ctx!;
    const member = ctx.onboarding.ensureFamilyForNewUser(
      harness.authSub,
      `${harness.authSub}@example.com`,
      "US_IOS"
    );
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction, "payment_vpc");
    // Method-blind status said "verified" here → client ping-ponged between
    // the 403 gate and a status that claimed it was done.
    let res = await consentStatusGET(statusRequest());
    expect((await res.json()).status).toBe("none");

    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(member.id, "guardian@example.com");
    await vpc.sendConsentLink(req.id);
    res = await consentStatusGET(statusRequest());
    expect((await res.json()).status).toBe("pending");

    vpc.confirmConsent(req.token);
    res = await consentStatusGET(statusRequest());
    expect((await res.json()).status).toBe("verified");
  });

  it("pending guardian email is NOT exposed to non-guardian household members", async () => {
    const ctx = harness.ctx!;
    const guardian = ctx.onboarding.ensureFamilyForNewUser(
      "auth-172-guardian",
      "g@example.com",
      "US_IOS"
    );
    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(guardian.id, "secret-parent@example.com");
    await vpc.sendConsentLink(req.id);

    // Same household, role "member".
    ctx.store.members.set("m-172-other", {
      ...guardian,
      id: "m-172-other",
      authUserId: harness.authSub,
      role: "member",
    });
    const res = await consentStatusGET(statusRequest());
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.email).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret-parent@example.com");
  });
});

describe("172 red-team — jurisdiction claim is fail-closed", () => {
  it("a token WITHOUT a server-set jurisdiction defaults to US_IOS (email_plus), not US", async () => {
    const ctx = createTestContext();
    const { member } = await requireBearerMember(
      new Request("http://localhost/x", { headers: { Authorization: "Bearer t" } }),
      { verify: async () => ({ sub: "auth-172-noclaim", email: "n@example.com" }) },
      () => ctx as unknown as ReturnType<typeof import("@/lib/context").createRequestContext>
    );
    expect(member.jurisdiction).toBe("US_IOS");
    // And the strict method is what the gate now requires:
    withActiveSubscription(ctx, member);
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction, "payment_vpc");
    expect(ctx.subscriptions.canCreateBabyPersona(member.id).allowed).toBe(false);
  });

  it("the production verifier reads app_metadata (server-set), never user_metadata", async () => {
    // user_metadata is writable by the CLIENT via auth.updateUser — trusting
    // it was a full COPPA-gate bypass. Assert at the source level since the
    // JWKS path can't run offline.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/supabase-jwt.ts", "utf8")
    );
    expect(src).toContain("app_metadata");
    expect(src).not.toContain("payload.user_metadata");
  });
});

describe("172 red-team — consent links expire", () => {
  it("an 8-day-old link no longer mints consent and the request reads 'expired'", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-172-ttl", "t@example.com", "US_IOS");
    const vpc = vpcService(ctx);
    const req = vpc.requestConsent(member.id, "parent@example.com");
    await vpc.sendConsentLink(req.id);
    // Backdate past the TTL.
    req.requestedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    ctx.store.emailPlusVpcRequests.set(req.id, req);

    expect(() => vpc.confirmConsent(req.token)).toThrow(/expired/i);
    expect(ctx.store.emailPlusVpcRequests.get(req.id)?.status).toBe("expired");
    expect(ctx.store.consentReceipts.size).toBe(0);
    // ConsentRequiredError import keeps this file honest about the gate type.
    expect(new ConsentRequiredError().code).toBe("consent_required");
  });
});
