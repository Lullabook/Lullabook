import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestContext, householdWithBaby } from "@/test/fixtures";

// Issue 146 — R1 is solo-only; this suite pins the R2 per-baby path.
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

describe("50 — moment capture + journal timeline", () => {
  it("creates a moment and lists it reverse-chronologically", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");

    const moment = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Waved bye-bye to Nani all by herself",
      occurredOn: "2026-06-13",
      isSignificant: true,
      momentType: "milestone",
    });

    expect(moment.body).toContain("Nani");
    const listed = ctx.moments.list(guardian.id, baby.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(moment.id);
    expect(listed[0].isSignificant).toBe(true);
  });

  it("scopes moments per baby", async () => {
    const ctx = createTestContext();
    const { guardian, baby: maya } = await householdWithBaby(ctx, "Maya");
    const leo = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });

    ctx.moments.create({
      memberId: guardian.id,
      babyId: leo.id,
      body: "Leo only moment",
      occurredOn: "2026-06-13",
      momentType: "funny",
    });

    expect(ctx.moments.list(guardian.id, leo.id)).toHaveLength(1);
    expect(ctx.moments.list(guardian.id, maya.id)).toHaveLength(0);
  });

  it("sorts by occurred_on then created_at descending", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");

    const older = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Yesterday",
      occurredOn: "2026-06-12",
      momentType: "cozy",
    });
    await new Promise((r) => setTimeout(r, 2));
    const newer = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Today first",
      occurredOn: "2026-06-13",
      momentType: "funny",
    });
    await new Promise((r) => setTimeout(r, 2));
    const sameDay = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Today second",
      occurredOn: "2026-06-13",
      momentType: "first",
    });

    const listed = ctx.moments.list(guardian.id, baby.id);
    expect(listed.map((m) => m.id)).toEqual([sameDay.id, newer.id, older.id]);
  });

  it("hard-delete purges moments for the household", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");

    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Gone after purge",
      occurredOn: "2026-06-13",
      momentType: "milestone",
    });

    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.store.moments.size).toBe(0);
  });
});
