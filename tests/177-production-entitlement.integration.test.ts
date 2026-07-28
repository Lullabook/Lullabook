import { afterEach, describe, expect, it, vi } from "vitest";
import { R1_PLAN_DEFINITION } from "@/domain/plan";

const requireBearerMember = vi.fn();
vi.mock("@/lib/bearer-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bearer-auth")>();
  return { ...actual, requireBearerMember };
});
vi.mock("@/lib/supabase-jwt", () => ({ createSupabaseJwtVerifier: vi.fn(() => ({})) }));
vi.mock("@/lib/context", () => ({ createRequestContext: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.R1_ONE_PLAN;
  delete process.env.R1_MULTI_FAMILY_ENABLED;
});

describe("177 — production R1 entitlement contract", () => {
  it("returns one canonical plan and usage without contradictory legacy caps or capabilities", async () => {
    requireBearerMember.mockResolvedValue({
      member: { id: "member-1", familyId: "family-1" },
      ctx: {
        entitlements: { getEntitlement: () => ({ tier: "normal" }) },
        storyCap: {
          getUsage: () => ({ count: 2, cap: 4, remaining: 2, resetDate: "2026-08-01" }),
        },
        credits: {
          getBalance: () => ({
            videoIncluded: 99,
            customStyleIncluded: 99,
            purchased: 99,
            resetDate: "2026-08-01",
          }),
        },
      },
    });

    const { GET } = await import("@/app/api/entitlement/route");
    const response = await GET(new Request("https://example.test/api/entitlement"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      plan: R1_PLAN_DEFINITION,
      usage: {
        storybooks: { count: 2, remaining: 2, resetDate: "2026-08-01" },
      },
    });
    for (const legacyField of ["tier", "storyCap", "memberCap", "capabilities", "credits"]) {
      expect(body).not.toHaveProperty(legacyField);
    }
  });

  it("serves the identical canonical plan shape to the mobile paywall", async () => {
    const { GET } = await import("@/app/api/paywall-config/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ plans: [R1_PLAN_DEFINITION] });
    expect(body.plans[0]).not.toHaveProperty("storyCap");
    expect(body.plans[0]).not.toHaveProperty("memberCap");
    expect(body.plans[0]).not.toHaveProperty("canNarrate");
  });

  it("mobile derives every displayed R1 limit from the server plan contract", async () => {
    const { getR1PlanFeatureLabels } = await import("@/domain/plan");
    const plan = {
      ...R1_PLAN_DEFINITION,
      limits: {
        storybooksPerMonth: 17,
        personas: 23,
        starringPersonas: 5,
        memberLogins: 1,
      },
    };

    expect(getR1PlanFeatureLabels(plan)).toEqual(expect.arrayContaining([
      "17 Storybooks per month",
      "23 trained Personas — any mix of babies and adults",
      "Up to 5 starring Personas per Storybook",
    ]));
  });
});
