import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";

/**
 * Issue 217 (GH #228) — prod-guarded, server-authoritative demo Pro grant.
 *
 * The Simulator demo needs full Pro access with no native purchase client. The
 * grant writes the SAME active Subscription row a real RevenueCat purchase
 * writes, so it is read back through the identical `isActive` →
 * `subscriptionIsLive` → `getTier` code path a paying Guardian exercises
 * (ENT-1). Gates are never bypassed: `requireEntitled` still evaluates on every
 * request and revoke returns the Family to free on the next gated read. SEC-5
 * fail-closes in production unless `LULLABOOK_DEMO_PRO_GRANT` is set, and there
 * is no `DEV_FORCE_SUBSCRIPTION` dependency.
 */
const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "guardian",
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
        jurisdiction: "US",
      };
    },
  }),
}));

import { POST } from "@/app/api/billing/demo-pro/route";

function bearerRequest(token = "good", body: unknown = { action: "grant" }): Request {
  return new Request("http://localhost/api/billing/demo-pro", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("217 — prod-guarded demo Pro grant", () => {
  const baseEnv: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
    LULLABOOK_DEMO_PRO_GRANT: process.env.LULLABOOK_DEMO_PRO_GRANT,
    DEV_FORCE_SUBSCRIPTION: process.env.DEV_FORCE_SUBSCRIPTION,
    R1_MULTI_FAMILY_ENABLED: process.env.R1_MULTI_FAMILY_ENABLED,
    R1_ONE_PLAN: process.env.R1_ONE_PLAN,
  };

  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    delete process.env.LULLABOOK_DEMO_PRO_GRANT;
    delete process.env.DEV_FORCE_SUBSCRIPTION;
    // Full-likeness family demo resolves the two-plan model to its fullest.
    (process.env as Record<string, string>).R1_MULTI_FAMILY_ENABLED = "true";
    delete process.env.R1_ONE_PLAN;
    harness.ctx = createTestContext();
    harness.authSub = "guardian";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(baseEnv)) {
      if (v === undefined) delete process.env[k];
      else (process.env as Record<string, string>)[k] = v;
    }
  });

  function makeGuardian() {
    const ctx = harness.ctx!;
    return ctx.onboarding.ensureFamilyForNewUser("guardian", "g@example.com");
  }

  it("ENT-1: grantDemoPro persists a real active Subscription read back through the same path as purchase", () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("none");

    ctx.subscriptions.grantDemoPro(guardian.familyId);

    const sub = ctx.store.getSubscription(guardian.familyId);
    expect(sub?.status).toBe("active");
    expect(sub?.tier).toBe("plus");
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("plus");
    // Full Pro: identical bundle a paying Our-Whole-Family Guardian would get.
    const plan = ctx.entitlements.getPlanEntitlement(guardian.familyId);
    expect(plan.plan).toBe("our_whole_family");
    expect(plan.canNarrate).toBe(true);
    expect(plan.canVideo).toBe(true);
    expect(plan.canCustomStyle).toBe(true);
    expect(plan.memberCap).toBe(Infinity);
    expect(() => ctx.entitlements.requireEntitled(guardian.familyId)).not.toThrow();
  });

  it("endpoint grants the authenticated Guardian's own Family to Pro", async () => {
    const ctx = harness.ctx!;
    makeGuardian();
    const res = await POST(bearerRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("grant");
    expect(body.isActive).toBe(true);
    expect(body.tier).toBe("plus");
    expect(ctx.entitlements.getTier(body.familyId)).toBe("plus");
  });

  it("SEC-5: refuses in production without the flag (403, no state); allowed when flag set", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    (process.env as Record<string, string>).NODE_ENV = "production";

    const refused = await POST(bearerRequest());
    expect(refused.status).toBe(403);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("none");

    (process.env as Record<string, string>).LULLABOOK_DEMO_PRO_GRANT = "true";
    const allowed = await POST(bearerRequest());
    expect(allowed.status).toBe(200);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
  });

  it("SEC-1: a forged client entitlement claim is ignored — the server store wins", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();

    // Forge a downgrade claim on grant; the server value (plus) still wins.
    const grantRes = await POST(
      bearerRequest("good", { action: "grant", entitlement: { tier: "none", isPro: false } }),
    );
    expect(grantRes.status).toBe(200);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("plus");

    // Forge an upgrade claim alongside revoke; access is still revoked.
    await POST(bearerRequest("good", { action: "revoke", entitlement: { tier: "plus", isPro: true } }));
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("none");
  });

  it("revoke immediately returns the Family to free on the next gated request (gate re-evaluated)", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    ctx.subscriptions.grantDemoPro(guardian.familyId);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("plus");

    const res = await POST(bearerRequest("good", { action: "revoke" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(false);
    expect(body.tier).toBe("none");

    // Next gated request is free: the entitlement gate still fires.
    expect(() => ctx.entitlements.requireEntitled(guardian.familyId)).toThrow(/subscription/);
  });

  it("has no DEV_FORCE_SUBSCRIPTION dependency — the grant is a real persisted subscription", () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    delete process.env.DEV_FORCE_SUBSCRIPTION;

    ctx.subscriptions.grantDemoPro(guardian.familyId);
    // Active because of the persisted row, not any dev override.
    expect(ctx.store.getSubscription(guardian.familyId)?.status).toBe("active");
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);

    ctx.subscriptions.revokeDemoPro(guardian.familyId);
    expect(ctx.store.getSubscription(guardian.familyId)).toBeUndefined();
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
  });

  it("Guardian boundary: a non-Guardian member cannot toggle the grant; bad action is 400", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    ctx.store.createMember({
      authUserId: "member",
      familyId: guardian.familyId,
      email: "m@example.com",
      role: "member",
      selfPersonaId: null,
      jurisdiction: "US",
    });
    harness.authSub = "member";
    const denied = await POST(bearerRequest());
    expect(denied.status).toBe(403);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("none");

    harness.authSub = "guardian";
    const bad = await POST(bearerRequest("good", { action: "snarf" }));
    expect(bad.status).toBe(400);
  });
});
