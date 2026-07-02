import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestContext } from "@/test/fixtures";

// Issue 146 — R1 is solo-only; this suite pins the R2 multi-baby path, so opt
// back into multi-family (the default cut would block a second baby).
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

describe("34 — household + multi-baby + world", () => {
  it("creates a default baby and selects it", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-34", "g@example.com");
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });

    expect(baby.isDefault).toBe(true);
    expect(ctx.babies.getSelected(guardian.id)?.id).toBe(baby.id);
  });

  it("supports multiple babies with a switcher", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-34b", "g2@example.com");
    const maya = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const leo = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Leo",
      rosterScope: "shared",
    });

    ctx.babies.selectBaby(guardian.id, leo.id);
    expect(ctx.babies.getSelected(guardian.id)?.displayName).toBe("Leo");

    ctx.babies.selectBaby(guardian.id, maya.id);
    expect(ctx.babies.getSelected(guardian.id)?.displayName).toBe("Maya");
  });

  it("isolates roster for a different-family baby", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-34c", "g3@example.com");
    const shared = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const isolated = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Sam",
      rosterScope: "isolated",
    });

    expect(shared.rosterGroupId).not.toBe(isolated.rosterGroupId);
    expect(isolated.rosterScope).toBe("isolated");
  });

  it("world home renders real selected baby counts", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await import("@/test/fixtures").then((f) =>
      f.householdWithBaby(ctx, "Maya")
    );

    const home = ctx.world.getHome(guardian.id);
    expect(home.baby.displayName).toBe("Maya");
    expect(home.baby.id).toBe(baby.id);
    expect(home.storyCount).toBe(0);
  });
});
