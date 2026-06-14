import { describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, householdWithBaby } from "@/test/fixtures";
import { WEEKLY_STORY_MIN_MOMENTS } from "@/services/journal-nudge";

describe("55 — weekly story suggestion", () => {
  it("shows when weekly threshold is met", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const now = new Date("2026-06-13T12:00:00Z");

    for (let i = 0; i < WEEKLY_STORY_MIN_MOMENTS; i++) {
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: `Moment ${i}`,
        occurredOn: "2026-06-12",
      });
    }

    expect(ctx.journalNudges.shouldShowWeeklySuggestion(guardian.id, baby.id, now)).toBe(true);
  });

  it("assembles brief with cast from linked people and theme from significant moment", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const nani = await createReadyAdult(ctx, guardian, "Nani");
    const now = new Date("2026-06-13T12:00:00Z");

    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "First steps in the garden",
      occurredOn: "2026-06-12",
      isSignificant: true,
      momentType: "milestone",
      linkedPersonaIds: [nani.id],
    });

    const brief = ctx.journalNudges.assembleWeeklyBrief(
      guardian.id,
      baby.id,
      babyPersona.id,
      now
    );

    expect(brief.theme).toContain("First steps");
    expect(brief.starringPersonaIds).toContain(nani.id);
    expect(brief.babyId).toBe(baby.id);
  });

  it("does not generate until parent confirms in Create (no auto-generate here)", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const before = ctx.store.storybooks.size;

    ctx.journalNudges.assembleWeeklyBrief(guardian.id, baby.id, null);
    expect(ctx.store.storybooks.size).toBe(before);
  });
});
