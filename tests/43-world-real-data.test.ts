import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  createTestContext,
  generateAndWait,
  householdWithBaby,
} from "@/test/fixtures";

// Issue 146 — R1 is solo-only; this suite pins the R2 multi-baby path.
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

describe("43 — world + stories on real data", () => {
  it("world home shows real storybooks for selected baby", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx);

    await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "everyday",
      theme: "Garden",
      pageCount: 5,
    });

    const home = ctx.world.getHome(guardian.id);
    expect(home.recentBooks).toHaveLength(1);
    expect(home.storyCount).toBe(1);
    expect(home.baby.id).toBe(baby.id);
  });

  it("filters storybooks by baby", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx);
    const leo = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });

    await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "milestone",
      theme: "First steps",
      pageCount: 5,
    });

    const mayaBooks = ctx.store.listStorybooksForBaby(baby.id, guardian.id);
    const leoBooks = ctx.store.listStorybooksForBaby(leo.id, guardian.id);
    expect(mayaBooks).toHaveLength(1);
    expect(leoBooks).toHaveLength(0);
  });
});
