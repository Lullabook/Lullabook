import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { R1_PLAN_DEFINITION } from "@/domain/plan";
import { getR1VisiblePlans } from "@/lib/paywall-config";

describe("194 — R1 plan single source", () => {
  it("keeps the accepted R1 economics in the plan definition", () => {
    expect(R1_PLAN_DEFINITION.pricing).toMatchObject({ monthly: 14.99, annual: 119.99 });
    expect(R1_PLAN_DEFINITION.limits.storybooksPerMonth).toBe(4);
  });

  afterEach(() => {
    delete process.env.R1_MULTI_FAMILY_ENABLED;
    delete process.env.R1_ONE_PLAN;
  });

  it("does not leave stale R1 price/cap literals in client or billing surfaces", () => {
    const [visible] = getR1VisiblePlans();
    expect(visible).toMatchObject({
      id: R1_PLAN_DEFINITION.plan,
      monthlyPrice: R1_PLAN_DEFINITION.pricing.monthly,
      annualPrice: R1_PLAN_DEFINITION.pricing.annual,
      storyCap: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
      memberCap: R1_PLAN_DEFINITION.limits.personas,
      starringPersonaCap: R1_PLAN_DEFINITION.limits.starringPersonas,
      memberLoginCap: R1_PLAN_DEFINITION.limits.memberLogins,
      ...R1_PLAN_DEFINITION.capabilities,
    });
    const files = [
      "src/services/entitlement.ts",
      "src/lib/paywall-config.ts",
      "src/domain/plan.ts",
      "mobile/app/billing.tsx",
      "mobile/lib/purchase-controller.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const executable = source.replace(/\/\/.*$/gm, "");
      if (file === "src/services/entitlement.ts") {
        expect(executable).toContain("getPlanEntitlement");
        expect(executable).toContain("R1_PLAN_DEFINITION");
      }
      if (file === "src/domain/plan.ts") {
        expect(executable).not.toMatch(/(?<!\d)(?:9\.99|79\.99)|storybooksPerMonth:\s*8/);
      }
      if (file === "src/lib/paywall-config.ts") {
        expect(executable).toContain("R1_PLAN_DEFINITION");
        expect(executable).toContain("getR1VisiblePlans");
        expect(executable).toContain("R1_PAYWALL_PLAN");
        expect(executable).toContain("monthlyPrice: R1_PLAN_DEFINITION.pricing.monthly");
        expect(executable).toContain("annualPrice: R1_PLAN_DEFINITION.pricing.annual");
      }
      if (file !== "src/lib/paywall-config.ts" && file !== "src/domain/plan.ts") {
        expect(executable).not.toMatch(/(?:9\.99|79\.99)/);
      }
    }
  });
});
