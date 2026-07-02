import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, householdWithBaby } from "@/test/fixtures";

// Issue 146 — R1 is solo-only; this suite pins the R2 multi-baby path.
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

describe("44 — multi-baby polish", () => {
  it("switching baby swaps world context", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx, "Maya");
    const leo = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });

    ctx.babies.selectBaby(guardian.id, leo.id);
    expect(ctx.world.getHome(guardian.id).baby.displayName).toBe("Leo");

    const maya = ctx.babies.list(guardian.id).find((b) => b.displayName === "Maya")!;
    ctx.babies.selectBaby(guardian.id, maya.id);
    expect(ctx.world.getHome(guardian.id).baby.displayName).toBe("Maya");
  });

  it("shared-family babies share roster; isolated baby does not inherit bonds", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx, "Maya");
    const leo = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Leo",
      rosterScope: "shared",
    });
    const sam = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Sam",
      rosterScope: "isolated",
    });
    const adult = await createReadyAdult(ctx, guardian, "Rose");
    const maya = ctx.babies.list(guardian.id).find((b) => b.displayName === "Maya")!;

    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: maya.id,
      personaId: adult.id,
      relationship: "Grandmother",
      babyCallsThem: "Nani",
      theyCallBaby: "moonbeam",
    });

    expect(ctx.familyRoster.listForBaby(guardian.id, leo.id)).toHaveLength(1);
    expect(ctx.familyRoster.listForBaby(guardian.id, sam.id)).toHaveLength(0);
  });
});
