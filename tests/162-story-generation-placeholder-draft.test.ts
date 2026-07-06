import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestContext,
  householdWithBaby,
  withActiveSubscription,
} from "@/test/fixtures";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropicSdk {
    messages = { create: createMock };
    constructor(_opts: unknown) {}
  },
}));

import { RealAnthropicAdapter } from "@/adapters/anthropic";

/**
 * Issue 162 — Story generation → viewable placeholder-art draft.
 *
 * The core R1 promise: a Brief (persona-free / Character-only OR with a ready
 * persona) must produce a viewable book. When no ready Persona is available OR
 * fal errors/rate-limits, every page lands as a placeholder-art page and the
 * book reaches `draft` (text-viewable), never `failed`-with-zero-pages once the
 * text pass succeeded. A text-pass refusal/throw/empty still reaches terminal
 * `failed` (I2.1).
 *
 * I3.1: placeholder art renders no raw uploaded photo and trains no likeness;
 * a Character-only book stays photo-free with no consent gate.
 */

describe("162 — Story generation → viewable placeholder-art draft", () => {
  async function guardianWithCharacter(
    ctx: ReturnType<typeof createTestContext>,
    email = "char-only@example.com"
  ) {
    const guardian = ctx.onboarding.ensureFamilyForNewUser(`auth-162-${email}`, email);
    withActiveSubscription(ctx, guardian);
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: {
        name: "Coco the Cat",
        topics: ["Curious", "Cuddly"],
        isFictional: true,
      },
    });
    return { guardian, character };
  }

  describe("I2.2 — persona-free / Character-only Brief → draft with placeholder pages", () => {
    it("a Character-only Brief (no personas) reaches `draft` with N pages, never failed-with-zero-pages", async () => {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx);

      // No baby persona exists — normalizeBrief will not auto-insert one.
      // starringPersonaIds is empty; the personas array in the pipeline is [].
      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "Coco's cozy night",
      });
      await ctx.workflow.drain();

      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      // Text succeeded → draft, never failed-with-zero-pages.
      expect(stored.status).toBe("draft");

      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.length).toBeGreaterThan(0);
      // Every page has text (the reader can render it).
      expect(pages.every((p) => p.text.length > 0)).toBe(true);
    });

    it("placeholder art uses the default LoRA key (no persona likeness) when personas is empty", async () => {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx);

      await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "placeholder art path",
      });
      await ctx.workflow.drain();

      // I3.1: placeholder art calls fal with "lora/default" (no persona LoRA).
      // Before the fix, personas[0]! threw and fal was never called.
      expect(ctx.fal.imageCalls).toBeGreaterThan(0);

      const books = [...ctx.store.storybooks.values()];
      const book = books[books.length - 1];
      const pages = ctx.store.getPagesForStorybook(book.id);
      // Pages should have ready illustrations (placeholder art, not all failed).
      const readyCount = pages.filter((p) => p.generationStatus === "ready").length;
      expect(readyCount).toBeGreaterThan(0);
    });

    it("a Character-only Brief with fal failing still reaches text-viewable `draft`", async () => {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx);
      // Make every image generation throw — simulates fal unavailable.
      ctx.fal.failImageOnPage = 0;
      ctx.fal.failPages = new Set(Array.from({ length: 12 }, (_, i) => i + 1));

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "fal-down character story",
      });
      await ctx.workflow.drain();

      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      // Text succeeded → draft (text-viewable), never failed-with-zero-pages.
      expect(stored.status).toBe("draft");

      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.every((p) => p.text.length > 0)).toBe(true);
      // Every page is illustration-failed but text is present (issue 102 path).
      expect(pages.every((p) => p.illustrationBlobKey === null)).toBe(true);
    });

    it("a Brief with a ready Baby Persona + Character still uses the persona LoRA (not placeholder)", async () => {
      const ctx = createTestContext();
      const { guardian, babyPersona } = await householdWithBaby(ctx, "Maya");
      const character = await ctx.characters.create({
        memberId: guardian.id,
        questionnaire: {
          name: "Pip the Dragon",
          topics: ["Brave"],
          isFictional: true,
        },
      });

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        starringCharacterIds: [character.id],
        babyId: undefined, // no babyId → no auto-context (journal cut)
        storyType: "bedtime",
        theme: "Maya and Pip",
      });
      await ctx.workflow.drain();

      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      expect(stored.status).toBe("draft");
      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.length).toBeGreaterThan(0);
      // With a ready persona, fal should have been called with the persona's
      // loraWeightKey (not lora/default) — at least some pages should be ready.
      expect(ctx.fal.imageCalls).toBeGreaterThan(0);
    });
  });

  describe("I2.1 — text-pass refusal/throw/empty → terminal `failed`", () => {
    it("a text-pass throw reaches terminal `failed` with zero pages (never stranded generating)", async () => {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx);
      vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(
        new Error("Claude outage")
      );

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "text fails",
      });
      await expect(ctx.workflow.drain()).rejects.toThrow("Claude outage");

      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      expect(stored.status).toBe("failed");
      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages).toHaveLength(0);
    });

    it("a text pass returning empty pages reaches terminal `failed`", async () => {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx);
      const original = ctx.anthropic.response;
      ctx.anthropic.response = {
        ...original,
        pages: [],
        scenes: [],
      };

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "empty text",
      });
      await ctx.workflow.drain();

      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      expect(stored.status).toBe("failed");
      ctx.anthropic.response = original;
    });

    it("watchdog reaps a stranded `generating` Character-only book past the budget", async () => {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx);

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "stranded",
      });
      // Don't drain — simulate a workflow that never completed.
      expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("generating");

      const budgetMs = 5 * 60 * 1000;
      const past = new Date(book.createdAt.getTime() + budgetMs + 1);
      const reaped = ctx.storybooks.reapStrandedGenerations(past, budgetMs);

      expect(reaped).toBe(1);
      expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("failed");
    });
  });

  describe("I3.1 — placeholder art renders no raw photo / trains no likeness", () => {
    it("a Character-only book creates no Persona and has no consent receipt requirement", async () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-162-nogate", "nogate@example.com");
      withActiveSubscription(ctx, guardian);
      const character = await ctx.characters.create({
        memberId: guardian.id,
        questionnaire: {
          name: "Mr. Moon",
          topics: ["Wise"],
          isFictional: true,
        },
      });

      // No consent receipt recorded (no baby persona created).
      const personasBefore = [...ctx.store.personas.values()].filter(
        (p) => p.familyId === guardian.familyId
      );
      expect(personasBefore).toHaveLength(0);

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "moon story",
      });
      await ctx.workflow.drain();

      // No persona was created by generation.
      const personasAfter = [...ctx.store.personas.values()].filter(
        (p) => p.familyId === guardian.familyId
      );
      expect(personasAfter).toHaveLength(0);

      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Issue 162 — RealAnthropicAdapter response parsing robustness.
 *
 * The live diagnosis (PRD v19 /part1): `claude-sonnet-4-6` returns HTTP 200 but
 * the book lands `failed` with zero pages — the throw is in `parseGeneratedStory`
 * at `src/adapters/anthropic.ts:143`. These tests pin the parser's behavior on
 * the corner cases that produce a zero-page `failed` book: truncated JSON
 * (max_tokens), malformed text, and a missing text block.
 */
describe("162 — RealAnthropicAdapter parseGeneratedStory robustness", () => {
  let adapter: RealAnthropicAdapter;

  const VALID_WIRE = {
    text: "Nova sails to the moon and back to bed.",
    pages: [
      { index: 0, text: "Nova put on her star boots." },
      { index: 1, text: "She sailed up, up, up — then home to bed." },
    ],
    scenes: [
      { pageIndex: 0, description: "Nova lacing star boots", personaIds: ["Nova"] },
      { pageIndex: 1, description: "Nova asleep under a quilt", personaIds: ["Nova"] },
    ],
    styleBible: {
      palette: "dusk lavender and warm amber",
      wardrobe: [{ castMember: "Nova", outfit: "yellow star boots and a navy onesie" }],
      artStyle: "soft watercolor",
    },
  };

  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    createMock.mockReset();
    adapter = new RealAnthropicAdapter();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses a valid JSON text block into a GeneratedStory", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(VALID_WIRE) }],
    });

    const story = await adapter.generateStory({
      brief: "a trip to the moon",
      personaNames: ["Nova"],
      pageCount: 2,
      storyType: "bedtime",
    });

    expect(story.pages).toHaveLength(2);
    expect(story.styleBible.wardrobe).toEqual({
      Nova: "yellow star boots and a navy onesie",
    });
  });

  it("throws a clear error on max_tokens (truncated JSON)", async () => {
    // Truncated JSON — what the API returns when max_tokens cuts off mid-output.
    const truncated = JSON.stringify(VALID_WIRE).slice(0, 50);
    createMock.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: truncated }],
    });

    await expect(
      adapter.generateStory({
        brief: "x",
        personaNames: [],
        pageCount: 1,
        storyType: "bedtime",
      })
    ).rejects.toThrow(/max_tokens/i);
  });

  it("throws a clear error when the text block contains non-JSON", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Once upon a time, Nova sailed..." }],
    });

    await expect(
      adapter.generateStory({
        brief: "x",
        personaNames: [],
        pageCount: 1,
        storyType: "bedtime",
      })
    ).rejects.toThrow(/JSON|malformed|parse/i);
  });

  it("throws a clear error when no text content block exists", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [],
    });

    await expect(
      adapter.generateStory({
        brief: "x",
        personaNames: [],
        pageCount: 1,
        storyType: "bedtime",
      })
    ).rejects.toThrow(/no.*content|no.*text/i);
  });

  it("surfaces a model refusal as a refused error", async () => {
    createMock.mockResolvedValue({ stop_reason: "refusal", content: [] });

    await expect(
      adapter.generateStory({
        brief: "x",
        personaNames: [],
        pageCount: 1,
        storyType: "bedtime",
      })
    ).rejects.toThrow(/refused/);
  });
});
