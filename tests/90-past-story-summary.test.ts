import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  createReadyAdult,
  createTestContext,
  goodPhoto,
  householdWithBaby,
  subscribedGuardian,
} from "@/test/fixtures";
import {
  PAST_STORY_ROLLING_WINDOW,
  PAST_STORY_SUMMARY_MAX_CHARS,
  ROLLING_SUMMARY_MAX_CHARS,
} from "@/services/past-story-summary";
import type { BabyPastStorySummary } from "@/domain/types";

// Issue 148 — R1 defers the Story Context Engine (which consumes the past-story
// summary); this suite pins the R2 anti-repeat path, so opt back in.
beforeAll(() => { process.env.R1_JOURNAL_MACHINERY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });

describe("90 — Past-Story continuity summary (anti-repeat)", () => {
  it("finalizing a Storybook writes a bounded summary with theme + cast", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const priya = await createReadyAdult(ctx, guardian, "Priya");
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: priya.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "star",
    });

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [priya.id, babyPersona.id],
      babyId: baby.id,
      storyType: "everyday",
      theme: "A Morning in Nani's Garden",
    });
    await ctx.workflow.drain();
    ctx.storybooks.finalize(guardian.id, book.id);

    const summaries = ctx.store.getBabyPastStorySummaries(baby.id, guardian.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].babyId).toBe(baby.id);
    expect(summaries[0].storybookId).toBe(book.id);
    expect(summaries[0].summary).toContain("Nani's Garden");
    expect(summaries[0].summary).toContain("Priya");
    expect(summaries[0].summary.length).toBeLessThanOrEqual(PAST_STORY_SUMMARY_MAX_CHARS);
    // No raw photo/blob data in the summary — text only.
    expect(summaries[0].summary).not.toMatch(/photos\/|blob|\.png|\.jpg/i);
  });

  it("rolling window caps at newest-N (oldest summary drops out)", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });

    // Insert N+1 summaries with strictly increasing createdAt so ordering is
    // deterministic, bypassing recordFinalization's new Date() precision.
    const total = PAST_STORY_ROLLING_WINDOW + 2;
    for (let i = 0; i < total; i++) {
      const record: BabyPastStorySummary = {
        id: `s-${i}`,
        familyId: guardian.familyId,
        babyId: baby.id,
        storybookId: `book-${i}`,
        summary: `Theme: Story number ${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      };
      ctx.store.saveBabyPastStorySummary(record);
    }

    const rolling = ctx.pastStorySummary.getRollingSummary(guardian.id, baby.id);
    expect(rolling).toBeDefined();
    // Newest N kept, oldest (Story number 0) dropped.
    expect(rolling).toContain(`Story number ${total - 1}`);
    expect(rolling).not.toContain("Story number 0");
    expect(rolling!.length).toBeLessThanOrEqual(ROLLING_SUMMARY_MAX_CHARS);
  });

  it("rolling window keeps the NEWEST N on identical createdAt (tie-break by insertion)", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const total = PAST_STORY_ROLLING_WINDOW + 2;
    // All share one timestamp (rapid back-to-back finalizations); insertion
    // order is the tiebreaker — later insert = newer.
    const sameTs = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < total; i++) {
      ctx.store.saveBabyPastStorySummary({
        id: `tie-${i}`,
        familyId: guardian.familyId,
        babyId: baby.id,
        storybookId: `book-${i}`,
        summary: `Theme: Story number ${i}`,
        createdAt: sameTs,
      });
    }

    const rolling = ctx.pastStorySummary.getRollingSummary(guardian.id, baby.id);
    expect(rolling).toContain(`Story number ${total - 1}`);
    expect(rolling).toContain(`Story number ${total - PAST_STORY_ROLLING_WINDOW}`);
    expect(rolling).not.toContain("Story number 0");
  });

  it("engine receives the rolling summary and the Prompt reflects an anti-repeat instruction", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const baby = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Maya",
      birthDate: "2025-03-01",
    });
    const babyPersona = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    const priya = await createReadyAdult(ctx, guardian, "Priya");
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: priya.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "star",
    });

    // First Story — finalize it so a summary is recorded.
    const book1 = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [priya.id, babyPersona.id],
      babyId: baby.id,
      storyType: "everyday",
      theme: "A Morning in Nani's Garden",
    });
    await ctx.workflow.drain();
    ctx.storybooks.finalize(guardian.id, book1.id);

    // Second Story — the context engine should surface the prior summary with
    // an anti-repeat instruction in the Prompt's background block.
    await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [priya.id, babyPersona.id],
      babyId: baby.id,
      storyType: "adventure",
      theme: "Maya at the Beach",
    });
    await ctx.workflow.drain();

    const call = ctx.anthropic.calls.at(-1) as
      | { momentContext?: string }
      | undefined;
    expect(call?.momentContext).toContain("PAST STORIES");
    expect(call?.momentContext).toContain("avoid repeating");
    expect(call?.momentContext).toContain("Nani's Garden");
  });

  it("no prior Stories → empty summary, generation proceeds with no PAST STORIES section", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const baby = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Maya",
      birthDate: "2025-03-01",
    });
    const babyPersona = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(ctx.pastStorySummary.getRollingSummary(guardian.id, baby.id)).toBeUndefined();

    await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Sleepy stars",
    });
    await ctx.workflow.drain();

    const call = ctx.anthropic.calls.at(-1) as
      | { momentContext?: string }
      | undefined;
    expect(call?.momentContext).not.toContain("PAST STORIES");
  });

  it("hard-delete purges past-story summaries (ADR-0007)", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "First Story",
    });
    await ctx.workflow.drain();
    ctx.storybooks.finalize(guardian.id, book.id);
    expect(ctx.store.getBabyPastStorySummaries(baby.id, guardian.id)).toHaveLength(1);

    await ctx.hardDelete.hardDelete(guardian.id);

    const remaining = [...ctx.store.babyPastStorySummaries.values()].filter(
      (s) => s.familyId === guardian.familyId
    );
    expect(remaining).toHaveLength(0);
  });

  it("Family-scoped + RLS: summaries don't leak across families", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Family A secret theme",
    });
    await ctx.workflow.drain();
    ctx.storybooks.finalize(guardian.id, book.id);

    // A second, unrelated family.
    const other = ctx.onboarding.ensureFamilyForNewUser("other-guardian", "o@example.com");
    const otherBaby = ctx.babies.addBaby({ memberId: other.id, displayName: "Leo" });

    // Other family sees no summary for its own baby…
    expect(ctx.pastStorySummary.getRollingSummary(other.id, otherBaby.id)).toBeUndefined();
    // …and cannot read family A's baby summaries (RLS).
    expect(() =>
      ctx.pastStorySummary.getRollingSummary(other.id, baby.id)
    ).toThrow(/Cannot read baby for another family|Baby not found/);
  });
});