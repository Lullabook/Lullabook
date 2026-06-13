import { describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, goodPhoto, householdWithBaby } from "@/test/fixtures";

describe("35 — family roster reframe", () => {
  it("lists family members with per-baby bonds", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Priya");

    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: adult.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "little star",
    });

    const roster = ctx.familyRoster.listForBaby(guardian.id, baby.id);
    expect(roster).toHaveLength(1);
    expect(roster[0]!.bond?.relationship).toBe("Mom");
    expect(roster[0]!.bond?.babyCallsThem).toBe("Mama");
    expect(roster[0]!.persona.displayName).toBe("Priya");
  });

  it("keeps nicknames per baby–person pair", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx, "Maya");
    const leo = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });
    const adult = await createReadyAdult(ctx, guardian, "Rose");

    const mayaBaby = ctx.babies.list(guardian.id).find((b) => b.displayName === "Maya")!;
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: mayaBaby.id,
      personaId: adult.id,
      relationship: "Grandmother",
      babyCallsThem: "Nani",
      theyCallBaby: "moonbeam",
    });
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: leo.id,
      personaId: adult.id,
      relationship: "Grandmother",
      babyCallsThem: "Nani",
      theyCallBaby: "sweetpea",
    });

    const mayaBond = ctx.familyRoster
      .listForBaby(guardian.id, mayaBaby.id)
      .find((m) => m.persona.id === adult.id)?.bond;
    const leoBond = ctx.familyRoster
      .listForBaby(guardian.id, leo.id)
      .find((m) => m.persona.id === adult.id)?.bond;

    expect(mayaBond?.theyCallBaby).toBe("moonbeam");
    expect(leoBond?.theyCallBaby).toBe("sweetpea");
  });
});
