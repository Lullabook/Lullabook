import { describe, expect, it } from "vitest";
import { createTestContext, householdWithBaby } from "@/test/fixtures";

describe("53 — daily nudge card", () => {
  it("shows when no moment logged today and not dismissed", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const now = new Date("2026-06-13T14:00:00Z");

    expect(ctx.journalNudges.shouldShowDailyNudge(guardian.id, baby.id, now)).toBe(true);
  });

  it("hides after logging a moment today", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const now = new Date("2026-06-13T14:00:00Z");

    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Today moment",
      occurredOn: "2026-06-13",
    });

    expect(ctx.journalNudges.shouldShowDailyNudge(guardian.id, baby.id, now)).toBe(false);
  });

  it("hides after dismiss until next day", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const today = new Date("2026-06-13T14:00:00Z");

    ctx.journalNudges.dismissDailyNudge(guardian.id, baby.id, today);
    expect(ctx.journalNudges.shouldShowDailyNudge(guardian.id, baby.id, today)).toBe(false);

    const tomorrow = new Date("2026-06-14T10:00:00Z");
    expect(ctx.journalNudges.shouldShowDailyNudge(guardian.id, baby.id, tomorrow)).toBe(true);
  });

  it("re-evaluates per baby independently", async () => {
    const ctx = createTestContext();
    const { guardian, baby: maya } = await householdWithBaby(ctx, "Maya");
    const leo = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });
    const now = new Date("2026-06-13T14:00:00Z");

    ctx.moments.create({
      memberId: guardian.id,
      babyId: maya.id,
      body: "Maya only",
      occurredOn: "2026-06-13",
    });

    expect(ctx.journalNudges.shouldShowDailyNudge(guardian.id, maya.id, now)).toBe(false);
    expect(ctx.journalNudges.shouldShowDailyNudge(guardian.id, leo.id, now)).toBe(true);
  });
});
