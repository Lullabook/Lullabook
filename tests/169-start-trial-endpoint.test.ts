import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";

/**
 * Issue 169 — Prod-guarded `POST /api/billing/start-trial` (SEC-2, FAIL-2).
 *
 * Bearer-authed like the other mobile API routes; resolves familyId from the
 * verified JWT and calls `SubscriptionService.activateTrial` (issue 168).
 * Guard mirrors `devForcedSubscription`: refuses in production BEFORE any
 * work, writing no subscription state.
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

import { POST } from "@/app/api/billing/start-trial/route";

function bearerRequest(token = "good"): Request {
  return new Request("http://localhost/api/billing/start-trial", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("169 — prod-guarded start-trial endpoint", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    harness.ctx = createTestContext();
    harness.authSub = "guardian";
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = prevNodeEnv ?? "test";
  });

  function makeGuardian() {
    const ctx = harness.ctx!;
    return ctx.onboarding.ensureFamilyForNewUser("guardian", "g@example.com");
  }

  it("non-prod: valid Bearer activates a trial and returns entitlement (isActive true)", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);

    const res = await POST(bearerRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.isActive).toBe(true);
    expect(body.trialEndsAt).toBeTruthy();
    expect(body.entitlement.tier).toBeTruthy();
    expect(body.entitlement.storyCap).toBeGreaterThan(0);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    expect(ctx.entitlements.getTier(guardian.familyId)).not.toBe("none");
  });

  it("SEC-2: refuses in production and writes no subscription state", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    (process.env as Record<string, string>).NODE_ENV = "production";

    const res = await POST(bearerRequest());
    expect(res.status).toBe(403);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("none");
  });

  it("idempotent: two calls → one trial sub, unchanged trialEndsAt", async () => {
    makeGuardian();
    const first = await POST(bearerRequest());
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    const second = await POST(bearerRequest());
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.trialEndsAt).toBe(firstBody.trialEndsAt);
    expect(secondBody.isActive).toBe(true);
  });

  it("FAIL-2: activateTrial failure → structured error, Household stays unentitled", async () => {
    const ctx = harness.ctx!;
    const guardian = makeGuardian();
    vi.spyOn(ctx.subscriptions, "activateTrial").mockImplementation(() => {
      throw new Error("store exploded");
    });

    const res = await POST(bearerRequest());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    expect(ctx.entitlements.getTier(guardian.familyId)).toBe("none");
  });

  it("rejects unauthenticated requests (401)", async () => {
    makeGuardian();
    const res = await POST(
      new Request("http://localhost/api/billing/start-trial", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });
});
