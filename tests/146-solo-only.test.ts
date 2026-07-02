import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestContext, withActiveSubscription } from "@/test/fixtures";
import { getR1VisiblePlans } from "@/lib/paywall-config";
import { isR1MultiFamilyEnabled } from "@/lib/r1-config";

/**
 * Issue 146 — Cut multi-family: solo Guardian, one baby, solo plan only.
 *
 * Acceptance: invite/accept endpoints are inert (clean 404, never 500);
 * create-rights resolve to solo-Guardian-only; one-baby-per-Household enforced
 * server-side; the paywall renders solo plan(s) only. Cutting multi-family
 * closes authz, not opens it.
 */

describe("146 — multi-family cut: invite/accept endpoints inert (404)", () => {
  beforeEach(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });
  afterEach(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

  it("isR1MultiFamilyEnabled() is false by default (solo-only in R1)", () => {
    expect(isR1MultiFamilyEnabled()).toBe(false);
  });

  it("POST /api/family/invite returns 404 before auth when multi-family cut", async () => {
    const { POST } = await import("@/app/api/family/invite/route");
    const res = await POST(new Request("https://x/api/family/invite", { method: "POST" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not available/i);
  });

  it("POST /api/family/accept returns 404 before auth when multi-family cut", async () => {
    const { POST } = await import("@/app/api/family/accept/route");
    const res = await POST(new Request("https://x/api/family/accept", { method: "POST" }));
    expect(res.status).toBe(404);
  });
});

describe("146 — solo Guardian create-rights + one-baby cap + solo paywall", () => {
  beforeEach(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });
  afterEach(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

  it("requireCanCreate blocks a non-Guardian even on the plus plan (solo-only)", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-146a", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const sub = ctx.store.getSubscription(guardian.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });
    // Add a non-guardian member via the family service (invite + accept).
    const { token } = ctx.family.inviteMember(guardian.id, "m@example.com");
    const member = ctx.family.acceptInvite(token, "auth-m146");
    expect(member.role).toBe("member");
    expect(() => ctx.entitlements.requireCanCreate(guardian.familyId, member.id)).toThrow(
      /guardian/i
    );
  });

  it("addBaby refuses a second baby per household (one-baby R1)", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-146b", "g@example.com");
    ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    expect(() => ctx.babies.addBaby({ memberId: guardian.id, displayName: "Sibling" })).toThrow(
      /one baby/i
    );
  });

  it("getR1VisiblePlans hides the collaborative plan when multi-family cut", () => {
    const plans = getR1VisiblePlans();
    expect(plans.map((p) => p.id)).toEqual(["just_us"]);
    expect(plans.find((p) => p.id === "our_whole_family")).toBeUndefined();
  });
});

describe("146 — R2 opt-in restores the multi-family path", () => {
  beforeEach(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
  afterEach(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

  it("a second baby is allowed when multi-family is re-enabled", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-146c", "g@example.com");
    ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    expect(() => ctx.babies.addBaby({ memberId: guardian.id, displayName: "Sibling" })).not.toThrow();
  });

  it("getR1VisiblePlans shows both plans when multi-family is re-enabled", () => {
    delete process.env.R1_ONE_PLAN;
    const plans = getR1VisiblePlans();
    expect(plans.map((p) => p.id).sort()).toEqual(["just_us", "our_whole_family"]);
  });
});
