import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReadyAdult,
  createTestContext,
  generateAndWait,
  goodPhoto,
  householdWithBaby,
} from "@/test/fixtures";
import { AutoContextService } from "@/services/auto-context";
import {
  NO_PAST_STORY_SUMMARY,
  NO_VISION_TEXT,
  STORY_CONTEXT_TOKEN_BUDGET,
  StoryContextSelector,
} from "@/services/context-selector";
import {
  SONNET_4_6_MODEL,
  SONNET_5_MODEL,
  getProductionStoryModel,
  validateGeneratedStoryContract,
} from "@/adapters/anthropic";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropicSdk {
    messages = { create: createMock };
    constructor(_opts: unknown) {}
  },
}));

function makeStory(personaIds: string[] = ["persona-a"]) {
  return {
    text: "A warm story with a beginning, middle, and end.",
    pages: Array.from({ length: 12 }, (_, index) => ({ index, text: `Page ${index}` })),
    scenes: Array.from({ length: 12 }, (_, pageIndex) => ({
      pageIndex,
      description: `Scene ${pageIndex}`,
      personaIds,
    })),
    styleBible: {
      palette: "warm amber and lavender",
      wardrobe: Object.fromEntries(personaIds.map((id) => [id, "soft blue pajamas"])),
      artStyle: "soft watercolor",
    },
  };
}

describe("181 — bounded lifetime context + 12-Page Sonnet contract", () => {
  beforeEach(() => {
    vi.stubEnv("R1_JOURNAL_MACHINERY_ENABLED", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    createMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("selects every authorized source under the bounded initial context budget", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    ctx.store.saveBaby({ ...baby, birthDate: "2025-03-01" });
    const priya = await createReadyAdult(ctx, guardian, "Priya");
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: priya.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "my little star",
    });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "The first steps were wobbly and wonderful",
      occurredOn: "2025-12-01",
      momentType: "first",
      isSignificant: true,
    });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Ordinary Tuesday pancakes",
      occurredOn: "2026-06-12",
      momentType: "cozy",
    });

    const selector = new StoryContextSelector(
      ctx.store,
      new AutoContextService(ctx.store),
      { getSummary: () => "Recent plot: a moonlit garden walk." },
      { getVisionText: () => ["Maya smiling beside a stack of pancakes"] },
      () => new Date("2026-06-21T00:00:00Z")
    );
    const selected = await selector.selectForBaby(guardian.id, baby.id, [babyPersona.id, priya.id]);

    expect(selected.promptBlock).toContain("Maya");
    expect(selected.promptBlock).toContain("Priya");
    expect(selected.promptBlock).toContain("Mom");
    expect(selected.promptBlock).toContain("first steps");
    expect(selected.promptBlock).toContain("Ordinary Tuesday pancakes");
    expect(selected.promptBlock).toContain("15 months");
    expect(selected.promptBlock).toContain("FIRSTS");
    expect(selected.promptBlock).toContain("pancakes");
    expect(selected.promptBlock).toContain("moonlit garden walk");
    expect(selected.tokenEstimate).toBeLessThanOrEqual(STORY_CONTEXT_TOKEN_BUDGET);
    expect(selected.sourceManifest).toMatchObject({
      familyId: guardian.familyId,
      babyId: baby.id,
      personaIds: [babyPersona.id, priya.id],
      momentIds: expect.arrayContaining(selected.moments.map((moment) => moment.id)),
      pastStorySummaryIncluded: true,
      photoDescriptionCount: 1,
    });
  });

  it("keeps family and baby isolation, and trims deterministically after protected sources", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const otherBaby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: otherBaby.id,
      body: "LEO-ONLY-SECRET",
      occurredOn: "2026-06-01",
      momentType: "milestone",
      isSignificant: true,
    });
    for (let index = 0; index < 10; index++) {
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: `ordinary-${index}-${"x".repeat(900)}`,
        occurredOn: `2026-06-${String(index + 1).padStart(2, "0")}`,
        momentType: "cozy",
      });
    }

    const selector = new StoryContextSelector(
      ctx.store,
      new AutoContextService(ctx.store),
      NO_PAST_STORY_SUMMARY,
      NO_VISION_TEXT,
      () => new Date("2026-06-21T00:00:00Z")
    );
    const first = await selector.selectForBaby(guardian.id, baby.id, [babyPersona.id, "foreign-persona"]);
    const second = await selector.selectForBaby(guardian.id, baby.id, [babyPersona.id, "foreign-persona"]);

    expect(first.promptBlock).not.toContain("LEO-ONLY-SECRET");
    expect(first.promptBlock).not.toContain("Other");
    expect(first.cast.map((member) => member.personaId)).toEqual([babyPersona.id]);
    expect(first.promptBlock).toBe(second.promptBlock);
    expect(first.tokenEstimate).toBeLessThanOrEqual(STORY_CONTEXT_TOKEN_BUDGET);
    expect(first.promptBlock).toContain("ordinary-9-");
    expect(first.promptBlock).not.toContain("ordinary-0-");
  });

  it("records a bounded Story source manifest without raw photos or an unbounded transcript", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Moon nap",
    });
    const withManifest = book as typeof book & {
      sourceManifest?: { momentIds: string[]; rawPhotos?: unknown; lifetimeTranscript?: unknown };
    };

    expect(withManifest.sourceManifest).toBeDefined();
    expect(withManifest.sourceManifest?.momentIds).toBeInstanceOf(Array);
    expect(withManifest.sourceManifest?.rawPhotos).toBeUndefined();
    expect(withManifest.sourceManifest?.lifetimeTranscript).toBeUndefined();
    expect(JSON.stringify(withManifest.sourceManifest)).not.toMatch(/\.png|\.jpg|photo\//i);
  });

  it("keeps structured output, records usage, and makes refusal/max-token/provider outcomes explicit", async () => {
    const wireStory = makeStory(["Nova"]);
    createMock.mockResolvedValueOnce({
      stop_reason: "end_turn",
      usage: { input_tokens: 101, output_tokens: 202 },
      content: [{
        type: "text",
        text: JSON.stringify({
          ...wireStory,
          styleBible: {
            ...wireStory.styleBible,
            wardrobe: [{ castMember: "Nova", outfit: "soft blue pajamas" }],
          },
        }),
      }],
    });
    const { RealAnthropicAdapter } = await import("@/adapters/anthropic");
    const adapter = new RealAnthropicAdapter();
    await adapter.generateStory({
      brief: "a moon nap",
      personaNames: ["Nova"],
      pageCount: 12,
      storyType: "bedtime",
    });
    expect(adapter.lastGenerationEvidence).toMatchObject({
      outcome: "success",
      inputTokens: 101,
      outputTokens: 202,
      stopReason: "end_turn",
    });
    expect(createMock.mock.calls[0][0].output_config.format.type).toBe("json_schema");

    createMock.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    await expect(adapter.generateStory({ brief: "unsafe", personaNames: [], pageCount: 12, storyType: "bedtime" })).rejects.toThrow(/refused/);
    expect(adapter.lastGenerationEvidence?.outcome).toBe("refusal");

    createMock.mockResolvedValueOnce({ stop_reason: "max_tokens", content: [] });
    await expect(adapter.generateStory({ brief: "long", personaNames: [], pageCount: 12, storyType: "bedtime" })).rejects.toThrow(/max_tokens/);
    expect(adapter.lastGenerationEvidence?.outcome).toBe("max_tokens");

    createMock.mockRejectedValueOnce(new Error("Anthropic unavailable"));
    await expect(adapter.generateStory({ brief: "outage", personaNames: [], pageCount: 12, storyType: "bedtime" })).rejects.toThrow(/unavailable/);
    expect(adapter.lastGenerationEvidence?.outcome).toBe("provider_error");
  });

  it("requires the semantic 12-Page contract before illustration spend", async () => {
    const valid = makeStory(["persona-a"]);
    expect(() => validateGeneratedStoryContract(valid, 12, ["persona-a"])).not.toThrow();
    expect(() => validateGeneratedStoryContract({ ...valid, pages: valid.pages.slice(0, 11) }, 12, ["persona-a"]))
      .toThrow(/exactly 12 Pages/);
    expect(() => validateGeneratedStoryContract({ ...valid, scenes: valid.scenes.map((scene, i) => ({ ...scene, pageIndex: i === 2 ? 8 : scene.pageIndex })) }, 12, ["persona-a"]))
      .toThrow(/sequential/);
    expect(() => validateGeneratedStoryContract({ ...valid, scenes: valid.scenes.map((scene) => ({ ...scene, personaIds: ["foreign"] })) }, 12, ["persona-a"]))
      .toThrow(/selected Persona IDs/);
    expect(() => validateGeneratedStoryContract({ ...valid, styleBible: { ...valid.styleBible, palette: "" } }, 12, ["persona-a"]))
      .toThrow(/Style Bible/);
  });

  it("keeps Sonnet 4.6 production routing unless an explicit golden-set decision selects Sonnet 5", () => {
    expect(getProductionStoryModel()).toBe(SONNET_4_6_MODEL);
    expect(getProductionStoryModel({ sonnet5GoldenSetWins: false })).toBe(SONNET_4_6_MODEL);
    expect(getProductionStoryModel({ sonnet5GoldenSetWins: true })).toBe(SONNET_5_MODEL);
  });

  it("releases the reserved Story allowance and spends no illustrations for invalid Story text", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx, "Maya");
    ctx.anthropic.response = {
      ...ctx.anthropic.response,
      pages: [],
      scenes: [],
    };
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: ctx.store.members.get(guardian.id)?.selectedBabyId ?? undefined,
      storyType: "bedtime",
      theme: "Invalid book",
    });
    await ctx.workflow.drain();

    expect(ctx.store.storybooks.get(book.id)?.status).toBe("failed");
    expect(ctx.storyCap.getReservation(book.id)).toBeUndefined();
    expect(ctx.fal.imageCalls).toBe(0);
  });
});
