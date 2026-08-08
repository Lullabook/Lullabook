import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnthropicAdapter,
  TextStoryGenerationInput,
} from "@/adapters/types";
import type { GeneratedStory, Persona, StoryType, TraitQuestionnaire } from "@/domain/types";
import {
  SONNET_4_6_MODEL,
  getProductionStoryModel,
  validateGeneratedStoryContract,
} from "@/adapters/anthropic";
import {
  NO_PAST_STORY_SUMMARY,
  NO_VISION_TEXT,
  STORY_CONTEXT_HARD_MAX_CHARS,
  STORY_CONTEXT_TOKEN_BUDGET,
  StoryContextSelector,
} from "@/services/context-selector";
import { AutoContextService } from "@/services/auto-context";
import {
  ProviderUnavailableError,
  STORY_TEXT_BACKOFF_BASE_MS,
  STORY_TEXT_BACKOFF_MAX_MS,
  STORY_TEXT_MAX_ATTEMPTS,
  StorybookService,
} from "@/services/storybook";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";
import {
  createReadyAdult,
  createTestContext,
  householdWithBaby,
} from "@/test/fixtures";

/**
 * 210 — Generate the twelve-Page Story text with five-Persona Family context.
 *
 * Feeds the real family roster (relationships + nicknames) into the Story
 * Context so the provider names and uses the real family, hardens the
 * twelve-Page contract against a roster this size, and proves FAIL-7 (bounded
 * retry → `provider_unavailable`) without any wall-clock or live-model asserts.
 */

/** Deterministic fake that ALWAYS surfaces a provider outage (5xx/rate-limit). */
class FailingAnthropicAdapter implements AnthropicAdapter {
  public calls = 0;
  constructor(private readonly error: unknown) {}
  async generateStory(): Promise<GeneratedStory> {
    this.calls++;
    throw this.error;
  }
  async generateTextStory(_input: TextStoryGenerationInput): Promise<{ text: string }> {
    throw this.error;
  }
  async adaptStory(): Promise<GeneratedStory> {
    this.calls++;
    throw this.error;
  }
  async generateCharacterDescription(
    _questionnaire: TraitQuestionnaire
  ): Promise<{ description: string }> {
    throw this.error;
  }
}

describe("210 — story context five-person roster + FAIL-7 retry", () => {
  beforeEach(() => {
    vi.stubEnv("R1_JOURNAL_MACHINERY_ENABLED", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Sonnet 4.6 as the production model (D7)", () => {
    expect(getProductionStoryModel()).toBe(SONNET_4_6_MODEL);
    expect(SONNET_4_6_MODEL).toBe("claude-sonnet-4-6");
  });

  it("assembles the five-person roster cast into a bounded, nickname-bearing context", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

    const adult = (displayName: string, id: string): Persona => ({
      id,
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "adult",
      displayName,
      status: "ready",
      loraWeightKey: null,
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    });

    // The five-person roster: 3yo daughter (baby persona) + four adults with
    // relationships + nicknames (14yo brother, 43yo father, 38yo mother, 27yo
    // brother). The `just_us` plan caps Persona creation at 3, so the extra two
    // adults are inserted directly into the store — the context engine only
    // reads the roster, it does not create it.
    const mother = await createReadyAdult(ctx, guardian, "Ana");
    const father = await createReadyAdult(ctx, guardian, "Leo");
    ctx.store.personas.set("p-alex", adult("Alex", "p-alex"));
    ctx.store.personas.set("p-sam", adult("Sam", "p-sam"));
    const olderBrother = ctx.store.getPersona("p-alex", guardian.id)!;
    const brother = ctx.store.getPersona("p-sam", guardian.id)!;

    const roster = [babyPersona.id, mother.id, father.id, olderBrother.id, brother.id];
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: mother.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "my little star",
    });
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: father.id,
      relationship: "Dad",
      babyCallsThem: "Dada",
      theyCallBaby: "little explorer",
    });
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: olderBrother.id,
      relationship: "Big brother",
      babyCallsThem: "big bro",
      theyCallBaby: "little bug",
    });
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: brother.id,
      relationship: "Brother",
      babyCallsThem: "bro",
      theyCallBaby: "munchkin",
    });

    const selector = new StoryContextSelector(
      ctx.store,
      new AutoContextService(ctx.store),
      NO_PAST_STORY_SUMMARY,
      NO_VISION_TEXT
    );
    const selected = await selector.selectForBaby(guardian.id, baby.id, roster);

    // Every roster member is surfaced as cast with relationship + nickname.
    for (const nick of ["Mama", "Dada", "big bro", "bro"]) {
      expect(selected.promptBlock).toContain(nick);
    }
    for (const rel of ["Mom", "Dad", "Big brother", "Brother"]) {
      expect(selected.promptBlock).toContain(rel);
    }
    expect(selected.cast.map((c) => c.personaId)).toEqual(roster);
    expect(selected.promptBlock).toContain("protagonist");
    // Bounded regardless of a five-person roster (AC bounded-context).
    expect(selected.tokenEstimate).toBeLessThanOrEqual(STORY_CONTEXT_TOKEN_BUDGET);
    expect(selected.promptBlock.length).toBeLessThanOrEqual(STORY_CONTEXT_HARD_MAX_CHARS);
  });

  it("bounds the context hard-cap even for an oversized protected Journal (AC bounded-size)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");
    // Significant Moments are PROTECTED by the greedy trim — grow the Journal
    // with enough of them that only the hard character cap can bound the block.
    for (let i = 0; i < 40; i++) {
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: `Significant memory ${i}: ${"x".repeat(500)}`,
        occurredOn: `2026-06-${String((i % 27) + 1).padStart(2, "0")}`,
        momentType: "milestone",
        isSignificant: true,
      });
    }

    const selector = new StoryContextSelector(
      ctx.store,
      new AutoContextService(ctx.store),
      NO_PAST_STORY_SUMMARY,
      NO_VISION_TEXT
    );
    const selected = await selector.selectForBaby(guardian.id, baby.id, [babyPersona.id]);

    expect(selected.promptBlock.length).toBeLessThanOrEqual(STORY_CONTEXT_HARD_MAX_CHARS);
    expect(selected.tokenEstimate).toBeLessThanOrEqual(Math.ceil(STORY_CONTEXT_HARD_MAX_CHARS / 4));
    // The protected content genuinely overflowed the soft budget, proving the
    // hard cap is what kicked in — not just the ordinary droppable trim.
    expect(selected.promptBlock.split("Significant memory").length).toBeGreaterThan(1);
  });

  it("generates exactly twelve contract-valid Pages that carry the selected roster into context (FAIL-2)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");
    const mother = await createReadyAdult(ctx, guardian, "Ana");
    const father = await createReadyAdult(ctx, guardian, "Leo");
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: mother.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "my little star",
    });
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: father.id,
      relationship: "Dad",
      babyCallsThem: "Dada",
      theyCallBaby: "little explorer",
    });

    const starring = [babyPersona.id, mother.id, father.id];
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: starring,
      babyId: baby.id,
      storyType: "adventure",
      theme: "A cozy moon adventure",
      setting: "the backyard",
    });
    await ctx.workflow.drain();

    // FAIL-2: exactly twelve Pages through the existing semantic contract.
    const persisted = ctx.store.getPersistedGeneration(book.id)!;
    expect(persisted.story.pages.length).toBe(12);
    expect(persisted.story.scenes.length).toBe(12);
    expect(() => validateGeneratedStoryContract(persisted.story, 12, starring)).not.toThrow();
    expect(ctx.store.getStorybook(book.id, guardian.id)?.status).toBe("draft");

    // The Story Context handed to the provider carries the roster nicknames +
    // relationships so the story text names and uses the real family (AC).
    const call = ctx.anthropic.calls[0] as {
      personaNames?: string[];
      personaIds?: string[];
      momentContext?: string;
      pageCount?: number;
    };
    expect(call.personaNames ?? []).toEqual(expect.arrayContaining(["Ana", "Leo"]));
    expect(call.personaIds ?? []).toEqual(expect.arrayContaining([mother.id, father.id]));
    expect(call.pageCount).toBe(12);
    expect(call.momentContext ?? "").toContain("Mama");
    expect(call.momentContext ?? "").toContain("Mom");
    expect(call.momentContext ?? "").toContain("Dada");
  });

  it("contract-violating text fails the Brief before any image spend (FAIL-2)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");
    // FakeAnthropic returns malformed text (empty pages/scenes).
    ctx.anthropic.response = {
      ...ctx.anthropic.response,
      pages: [],
      scenes: [],
    };
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Invalid book",
    });
    await ctx.workflow.drain();

    expect(ctx.store.getStorybook(book.id, guardian.id)?.status).toBe("failed");
    expect(ctx.storyCap.getReservation(book.id)).toBeUndefined();
    expect(ctx.fal.imageCalls).toBe(0);
  });

  it("retries a 5xx/rate-limit twice with bounded backoff, then fails the Brief with provider_unavailable and spends no images (FAIL-7)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

    const rateLimit = Object.assign(new Error("rate limit exceeded"), { status: 429 });
    const failing = new FailingAnthropicAdapter(rateLimit);
    const slept: number[] = [];
    const sleeper = async (ms: number) => {
      slept.push(ms);
    };

    const service = new StorybookService(
      ctx.store,
      failing,
      ctx.fal,
      ctx.childSafety,
      ctx.blobs,
      ctx.workflow,
      ctx.subscriptions,
      ctx.classicCatalog,
      false,
      null,
      null,
      ctx.pastStorySummary,
      ctx.entitlements,
      {},
      new ProviderCostMeteringService(ctx.store),
      ctx.storyCap,
      {
        maxAttempts: STORY_TEXT_MAX_ATTEMPTS,
        backoffBaseMs: STORY_TEXT_BACKOFF_BASE_MS,
        backoffMaxMs: STORY_TEXT_BACKOFF_MAX_MS,
        sleeper,
      }
    );

    const book = await service.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Outage book",
    });

    let thrown: unknown;
    try {
      await ctx.workflow.drain();
    } catch (error) {
      thrown = error;
    }

    // Exactly two retries (three provider calls).
    expect(failing.calls).toBe(STORY_TEXT_MAX_ATTEMPTS);
    expect(failing.calls).toBe(3);
    // Two bounded backoff sleeps, monotonic, each within [base, max].
    expect(slept).toHaveLength(2);
    expect(slept[0]).toBe(STORY_TEXT_BACKOFF_BASE_MS);
    expect(slept[1]).toBeLessThanOrEqual(STORY_TEXT_BACKOFF_MAX_MS);
    for (const d of slept) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(STORY_TEXT_BACKOFF_MAX_MS);
    }
    // LAT-2: bounded-call structure keeps total retry latency far under 25s.
    const totalBackoffMs = slept.reduce((a, b) => a + b, 0);
    expect(totalBackoffMs).toBeLessThan(25_000);

    // FAIL-7: provider_unavailable surfaces as a typed error, Book marked
    // failed, and zero image spend follows.
    expect(thrown).toBeInstanceOf(ProviderUnavailableError);
    expect((thrown as ProviderUnavailableError).code).toBe("provider_unavailable");
    expect(ctx.store.getStorybook(book.id, guardian.id)?.status).toBe("failed");
    expect(ctx.storyCap.getReservation(book.id)).toBeUndefined();
    expect(ctx.fal.imageCalls).toBe(0);
  });

  it("does not retry a non-retryable provider error (FAIL-7 only short-circuits 5xx/rate-limit)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");
    const failing = new FailingAnthropicAdapter(new Error("malformed structured output"));
    const slept: number[] = [];
    const service = new StorybookService(
      ctx.store,
      failing,
      ctx.fal,
      ctx.childSafety,
      ctx.blobs,
      ctx.workflow,
      ctx.subscriptions,
      ctx.classicCatalog,
      false,
      null,
      null,
      ctx.pastStorySummary,
      ctx.entitlements,
      {},
      new ProviderCostMeteringService(ctx.store),
      ctx.storyCap,
      { sleeper: async (ms) => { slept.push(ms); } }
    );

    const book = await service.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Gen book",
    });
    let thrown: unknown;
    try {
      await ctx.workflow.drain();
    } catch (error) {
      thrown = error;
    }

    expect(failing.calls).toBe(1);
    expect(slept).toHaveLength(0);
    expect(thrown).not.toBeInstanceOf(ProviderUnavailableError);
    expect(ctx.store.getStorybook(book.id, guardian.id)?.status).toBe("failed");
    expect(ctx.fal.imageCalls).toBe(0);
  });

  it("succeeds a retryable-first then recovers on the second attempt", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");
    // A real, contract-valid GeneratedStory returned on the second attempt.
    const good: GeneratedStory = {
      text: "A warm adventure with a beginning, middle, and end.",
      pages: Array.from({ length: 12 }, (_, i) => ({ index: i, text: `Page ${i + 1}` })),
      scenes: Array.from({ length: 12 }, (_, i) => ({
        pageIndex: i,
        description: `Scene ${i + 1}`,
        personaIds: [babyPersona.id],
      })),
      styleBible: {
        palette: "warm amber",
        wardrobe: { [babyPersona.id]: "soft blue pajamas" },
        artStyle: "watercolor",
      },
    };
    let callCount = 0;
    const flaky: AnthropicAdapter = {
      async generateStory() {
        callCount++;
        if (callCount === 1) {
          throw Object.assign(new Error("overloaded"), { status: 503 });
        }
        return good;
      },
      async generateTextStory(_i: TextStoryGenerationInput) {
        return { text: "once" };
      },
      async adaptStory() {
        return good;
      },
      async generateCharacterDescription(_q: TraitQuestionnaire) {
        return { description: "A friend" };
      },
    };
    const slept: number[] = [];
    const service = new StorybookService(
      ctx.store,
      flaky,
      ctx.fal,
      ctx.childSafety,
      ctx.blobs,
      ctx.workflow,
      ctx.subscriptions,
      ctx.classicCatalog,
      false,
      null,
      null,
      ctx.pastStorySummary,
      ctx.entitlements,
      {},
      new ProviderCostMeteringService(ctx.store),
      ctx.storyCap,
      { sleeper: async (ms) => { slept.push(ms); } }
    );

    const book = await service.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "adventure",
      theme: "Recovery adventure",
    });
    await ctx.workflow.drain();

    expect(callCount).toBe(2);
    expect(slept).toHaveLength(1);
    expect(ctx.store.getStorybook(book.id, guardian.id)?.status).toBe("draft");
    const persisted = ctx.store.getPersistedGeneration(book.id)!;
    expect(() => validateGeneratedStoryContract(persisted.story, 12, [babyPersona.id])).not.toThrow();
  });
});
