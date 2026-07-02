import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  PAYWALL_PLANS,
  getR1VisiblePlans,
  isR1OnePlan,
} from "@/lib/paywall-config";

/**
 * Issue 129 — Collapse to one plan for R1.
 *
 * R1 shows exactly ONE plan (Just Us + 7-day trial); "Our Whole Family" is
 * hidden until its features exist (R2). The two-plan model stays in code
 * (`PAYWALL_PLANS`) behind the `R1_ONE_PLAN` flag — no entitlement regressions.
 *
 * Issue 146 — multi-family is also cut in R1, which independently hides the
 * collaborative plan. This suite pins the R2 two-plan path, so opt back into
 * multi-family here; the `R1_ONE_PLAN` flag is still exercised per-test below.
 */
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

describe("129 — R1 one-plan collapse (flag-driven, two-plan model retained)", () => {
  const prev = process.env.R1_ONE_PLAN;

  afterEach(() => {
    if (prev === undefined) delete process.env.R1_ONE_PLAN;
    else process.env.R1_ONE_PLAN = prev;
  });

  it("the full two-plan model stays in code (R2 returns both)", () => {
    delete process.env.R1_ONE_PLAN;
    expect(PAYWALL_PLANS).toHaveLength(2);
    expect(PAYWALL_PLANS.map((p) => p.id)).toEqual(["just_us", "our_whole_family"]);
    expect(isR1OnePlan()).toBe(false);
    expect(getR1VisiblePlans()).toHaveLength(2);
  });

  it("R1_ONE_PLAN=true hides Our Whole Family — exactly one plan + trial", () => {
    process.env.R1_ONE_PLAN = "true";
    expect(isR1OnePlan()).toBe(true);
    const visible = getR1VisiblePlans();
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("just_us");
    // The premium tier is not shown or sellable.
    expect(visible.find((p) => p.id === "our_whole_family")).toBeUndefined();
  });

  it("no entitlement regression — the server boundary is unchanged by the flag", () => {
    // The flag only filters the *visible* paywall; EntitlementService still
    // honors whichever tier a subscription actually carries. (Covered by 116/117
    // + 121; this test asserts the flag does not touch the plan definitions.)
    process.env.R1_ONE_PLAN = "true";
    const full = PAYWALL_PLANS.find((p) => p.id === "our_whole_family");
    expect(full?.storyCap).toBe(20); // still defined for R2 / server use
  });
});
