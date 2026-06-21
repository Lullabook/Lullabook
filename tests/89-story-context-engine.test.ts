import { describe, expect, it } from "vitest";
import {
  createReadyAdult,
  createTestContext,
  goodPhoto,
  householdWithBaby,
  subscribedGuardian,
} from "@/test/fixtures";
import { AutoContextService } from "@/services/auto-context";
import {
  NO_PAST_STORY_SUMMARY,
  NO_VISION_TEXT,
  STORY_CONTEXT_TOKEN_BUDGET,
  StoryContextSelector,
} from "@/services/context-selector";

const FIXED_NOW = () => new Date("2026-06-21T00:00:00Z");

function selector(
  ctx: ReturnType<typeof createTestContext>,
  opts: {
    pastStory?: { getSummary: (m: string, b: string) => string | undefined };
    vision?: { getVisionText: (m: string, b: string) => string[] };
    now?: () => Date;
  } = {}
) {
  return new StoryContextSelector(
    ctx.store,
    new AutoContextService(ctx.store),
    opts.pastStory ?? NO_PAST_STORY_SUMMARY,
    opts.vision ?? NO_VISION_TEXT,
    opts.now ?? FIXED_NOW
  );
}

describe("89 — Story Context Engine core (ADR-0022)", () => {
  it("includes significant Moments always + ordinary only since the last Story watermark", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");

    // A significant Moment logged long ago is always included.
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "First steps (significant, old)",
      occurredOn: "2025-12-01",
      momentType: "milestone",
      isSignificant: true,
    });
    // Ordinary Moment logged *before* a future watermark → excluded.
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Old ordinary before watermark",
      occurredOn: "2026-06-10",
      momentType: "cozy",
      isSignificant: false,
    });
    ctx.store.saveAutoContextWatermark({ babyId: baby.id, lastStoryAt: new Date("2030-01-01") });

    const set = await selector(ctx).selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.promptBlock).toContain("First steps (significant, old)");
    expect(set.promptBlock).not.toContain("Old ordinary before watermark");

    // Now move the watermark into the past → ordinary since last Story is included.
    ctx.store.saveAutoContextWatermark({ babyId: baby.id, lastStoryAt: new Date("2020-01-01") });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Recent ordinary after watermark",
      occurredOn: "2026-06-12",
      momentType: "funny",
      isSignificant: false,
    });
    const set2 = await selector(ctx).selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set2.promptBlock).toContain("Recent ordinary after watermark");
  });

  it("assembles roster cast from starring personas + their bonds", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const priya = await createReadyAdult(ctx, guardian, "Priya");
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: priya.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "my little star",
    });

    const set = await selector(ctx).selectForBaby(guardian.id, baby.id, [
      babyPersona.id,
      priya.id,
    ]);
    expect(set.promptBlock).toContain("Maya");
    expect(set.promptBlock).toContain("Priya");
    expect(set.promptBlock).toContain("Mom");
    expect(set.promptBlock).toContain("Mama");
    const priyaCast = set.cast.find((c) => c.personaId === priya.id);
    expect(priyaCast?.relationship).toBe("Mom");
    expect(priyaCast?.babyCallsThem).toBe("Mama");
    const babyCast = set.cast.find((c) => c.personaId === babyPersona.id);
    expect(babyCast?.role).toBe("protagonist");
  });

  it("derives an age summary from the baby birthDate", async () => {
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

    const set = await selector(ctx).selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.ageSummary).toMatch(/15 months/);
    expect(set.promptBlock).toContain("15 months");
  });

  it("includes Firsts (milestone/first Moments) as an explicit section", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Took first steps!",
      occurredOn: "2026-06-01",
      momentType: "first",
      isSignificant: true,
    });

    const set = await selector(ctx).selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.firsts).toContainEqual("Took first steps!");
    expect(set.promptBlock).toContain("FIRSTS");
    expect(set.promptBlock).toContain("Took first steps!");
  });

  it("past-story summary seam: present → anti-repeat instruction; absent → degrades cleanly", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");

    const withSummary = selector(ctx, {
      pastStory: {
        getSummary: () => "Maya explored Nani's garden and met a friendly snail.",
      },
    });
    const set = await withSummary.selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.pastStorySummary).toContain("Nani's garden");
    expect(set.promptBlock).toContain("PAST STORIES");
    expect(set.promptBlock).toContain("avoid repeating");
    expect(set.promptBlock).toContain("Nani's garden");

    const without = selector(ctx);
    const set2 = await without.selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set2.pastStorySummary).toBeUndefined();
    expect(set2.promptBlock).not.toContain("PAST STORIES");
  });

  it("vision-text seam: present → text only, never a raw image; absent → degrades", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");

    const withVision = selector(ctx, {
      vision: { getVisionText: () => ["Maya smiling in a high chair at lunch"] },
    });
    const set = await withVision.selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.visionText).toContainEqual("Maya smiling in a high chair at lunch");
    expect(set.promptBlock).toContain("PHOTO CONTEXT");
    expect(set.promptBlock).toContain("Maya smiling in a high chair at lunch");
    // Security invariant: only text descriptions ever enter the Prompt — the
    // provider interface carries strings, never image bytes.
    expect(typeof set.visionText[0]).toBe("string");

    const without = selector(ctx);
    const set2 = await without.selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set2.visionText).toEqual([]);
    expect(set2.promptBlock).not.toContain("PHOTO CONTEXT");
  });

  it("enforces the token cap: trims ordinary Moments before significant; cast + past-story + significant protected", async () => {
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

    // One significant Moment that must survive trimming.
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "SIGNIFICANT-KEEPER " + "s".repeat(1100),
      occurredOn: "2026-06-01",
      momentType: "milestone",
      isSignificant: true,
    });
    // 9 long ordinary Moments — enough to push the assembled block OVER the
    // 2000-token budget even after AutoContextService's 10-Moment cap, so the
    // selector's own budget trim must fire.
    for (let i = 0; i < 9; i++) {
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: `ordinary-${i}-` + "o".repeat(1100),
        occurredOn: "2026-06-02",
        momentType: "cozy",
        isSignificant: false,
      });
    }

    const set = await selector(ctx, {
      pastStory: { getSummary: () => "Maya's recent plot: a rainy-day puddle adventure." },
    }).selectForBaby(guardian.id, baby.id, [babyPersona.id, priya.id]);

    expect(set.tokenEstimate).toBeLessThanOrEqual(STORY_CONTEXT_TOKEN_BUDGET);
    // Protected content survives the trim.
    expect(set.promptBlock).toContain("SIGNIFICANT-KEEPER");
    expect(set.promptBlock).toContain("Priya");
    expect(set.promptBlock).toContain("rainy-day puddle adventure");
    // The selector dropped some ordinary Moments to fit the budget (it did not
    // merely rely on AutoContextService's 10-Moment cap).
    const keptOrdinary = Array.from({ length: 9 }, (_, i) => `ordinary-${i}-`)
      .filter((tag) => set.promptBlock.includes(tag)).length;
    expect(keptOrdinary).toBeLessThan(9);
  });

  it("skips a malformed-occurredOn Moment (not fatal) while keeping valid ones", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Valid significant",
      occurredOn: "2026-06-01",
      momentType: "milestone",
      isSignificant: true,
    });
    // Malformed occurredOn injected directly past the service (the store has no
    // format guard); the engine must skip it, not surface it or throw.
    ctx.store.saveMoment({
      id: "bad-moment",
      familyId: guardian.familyId,
      babyId: baby.id,
      createdByMemberId: guardian.id,
      body: "Malformed date should be skipped",
      occurredOn: "not-a-date",
      isSignificant: true,
      momentType: "milestone",
      createdAt: new Date(),
    });

    const set = await selector(ctx).selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.promptBlock).toContain("Valid significant");
    expect(set.promptBlock).not.toContain("Malformed date should be skipped");
    expect(set.moments.some((m) => m.body === "Malformed date should be skipped")).toBe(false);
  });

  it("degrades to cast + age on empty sources and never throws", async () => {
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

    const set = await selector(ctx).selectForBaby(guardian.id, baby.id, [babyPersona.id]);
    expect(set.moments).toEqual([]);
    expect(set.firsts).toEqual([]);
    expect(set.visionText).toEqual([]);
    expect(set.pastStorySummary).toBeUndefined();
    expect(set.promptBlock).toContain("Maya");
    expect(set.promptBlock).toContain("15 months");
  });

  it("never crosses Babies: another Baby's Moments do not leak", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx, "Maya");
    const babyA = ctx.babies.list(guardian.id).find((b) => b.displayName === "Maya")!;
    const babyB = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });

    ctx.moments.create({
      memberId: guardian.id,
      babyId: babyB.id,
      body: "Leo's secret significant moment",
      occurredOn: "2026-06-01",
      momentType: "milestone",
      isSignificant: true,
    });

    const set = await selector(ctx).selectForBaby(guardian.id, babyA.id, [babyPersona.id]);
    expect(set.promptBlock).not.toContain("Leo's secret significant moment");
  });

  it("RLS guard: a member of another family cannot select another family's baby", async () => {
    const ctx = createTestContext();
    const { baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    // A second, unrelated family (distinct authUserId — onboarding dedups by it).
    const other = ctx.onboarding.ensureFamilyForNewUser("other-guardian", "o@example.com");

    await expect(
      selector(ctx).selectForBaby(other.id, baby.id, [babyPersona.id])
    ).rejects.toThrow(/Cannot read baby for another family|Baby not found/);
  });

  it("integration: Storybook generation injects the context set and advances the watermark on success", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const baby = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Maya",
      birthDate: "2025-03-01",
    });
    const _babyPersona = await ctx.personas.createBaby({
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
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Significant garden moment",
      occurredOn: "2026-06-01",
      momentType: "milestone",
      isSignificant: true,
    });

    await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [priya.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Sleepy stars",
    });
    await ctx.workflow.drain();

    const call = ctx.anthropic.calls.at(-1) as
      | { momentContext?: string }
      | undefined;
    expect(call?.momentContext).toContain("Priya");
    expect(call?.momentContext).toContain("Significant garden moment");
    expect(call?.momentContext).toContain("15 months");
    expect(ctx.store.getAutoContextWatermark(baby.id)?.lastStoryAt).toBeDefined();
  });

  it("integration: watermark holds on failed generation (ADR-0019 contract preserved)", async () => {
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
    ctx.anthropic.response = {
      text: "",
      pages: [],
      scenes: [],
      styleBible: { palette: "", wardrobe: {}, artStyle: "" },
    };
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Should stay after failure",
      occurredOn: "2026-06-13",
    });

    await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Fail case",
    });
    await ctx.workflow.drain();

    expect(ctx.store.getAutoContextWatermark(baby.id)?.lastStoryAt).toBeUndefined();
    const call = ctx.anthropic.calls.at(-1) as
      | { momentContext?: string }
      | undefined;
    expect(call?.momentContext).toContain("Should stay after failure");
  });
});