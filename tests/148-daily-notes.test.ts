import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import { generateRealBedtimeBook } from "@/dev/seed-maya-world";
import { isR1JournalMachineryEnabled } from "@/lib/r1-config";

/**
 * Issue 148 — Keep Daily Notes; defer the rest of Journal/Moments.
 *
 * Acceptance: daily-note capture works end-to-end (solo Guardian, one baby);
 * the Story Context Engine / Firsts / weekly suggestion are gated off (inert —
 * no reachable UI, no momentContext injection); story generation does NOT
 * depend on the deferred auto-context layer (a book generates with daily notes
 * present or absent, no spinner waiting on it).
 */

async function setupBaby() {
  const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });
  const guardian = await subscribedGuardian(ctx);
  const babyPersona = await ctx.personas.createBaby({
    memberId: guardian.id,
    displayName: "Maya",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
  });
  ctx.personas.acceptLikeness(babyPersona.id, guardian.id);
  const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
  return { ctx, guardian, babyPersona, baby };
}

describe("148 — daily notes capture kept (works end-to-end)", () => {
  beforeEach(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });
  afterEach(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });

  it("a solo Guardian can create + list a daily note for their one baby", async () => {
    const { ctx, guardian, baby } = await setupBaby();
    const m = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Waved bye-bye to Nani all by herself",
      momentType: "milestone",
    });
    const listed = ctx.moments.list(guardian.id, baby.id);
    expect(listed.map((x) => x.id)).toContain(m.id);
    expect(listed[0].body).toContain("Waved bye-bye");
  });
});

describe("148 — Story Context Engine deferred (inert, generation unaffected)", () => {
  beforeEach(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });
  afterEach(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });

  it("isR1JournalMachineryEnabled() is false by default (deferred in R1)", () => {
    expect(isR1JournalMachineryEnabled()).toBe(false);
  });

  it("generation injects the bounded Story Context set (PRD v21 restores the engine for R1)", async () => {
    const { ctx, guardian, babyPersona, baby } = await setupBaby();
    // Log a daily note — the restored bounded engine selects it.
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "First steps in the garden",
      momentType: "milestone",
      isSignificant: true,
    });
    const book = await generateRealBedtimeBook(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "A cozy bedtime under the stars",
    });
    // Terminal state — generation never strands on the context layer.
    expect(book.status).toBe("draft");
    // PRD v21 / ticket 181: the bounded deterministic Story Context set IS
    // disclosed to the provider (previously cut by issue 148; ADR-0028
    // restores only the bounded engine, never an unbounded transcript).
    const call = ctx.anthropic.calls[0] as { momentContext?: string };
    expect(call?.momentContext).toContain("First steps in the garden");
  });

  it("weekly suggestion never surfaces when journal machinery is cut", async () => {
    const { ctx, guardian, baby } = await setupBaby();
    // Log several moments — would trigger the weekly suggestion if enabled.
    for (let i = 0; i < 4; i++) {
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: `Moment ${i}`,
        momentType: "cozy",
      });
    }
    expect(ctx.journalNudges.shouldShowWeeklySuggestion(guardian.id, baby.id)).toBe(false);
  });
});

describe("148 — R2 opt-in restores the Story Context Engine", () => {
  beforeEach(() => { process.env.R1_JOURNAL_MACHINERY_ENABLED = "true"; });
  afterEach(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });

  it("generation injects momentContext when journal machinery is re-enabled", async () => {
    const { ctx, guardian, babyPersona, baby } = await setupBaby();
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Significant garden moment",
      momentType: "milestone",
      isSignificant: true,
    });
    await generateRealBedtimeBook(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Garden evening",
    });
    const call = ctx.anthropic.calls[0] as { momentContext?: string };
    expect(call?.momentContext).toBeDefined();
    expect(call?.momentContext).toContain("garden moment");
  });
});
