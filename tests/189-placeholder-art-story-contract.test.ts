import { describe, expect, it, vi } from "vitest";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  householdWithBabyUnconfirmed,
  withActiveSubscription,
} from "@/test/fixtures";
import {
  LikenessGateError,
  RerollBudgetError,
  UnresolvedPageError,
} from "@/services/storybook";
import { renderPlaceholderArtSvg, shouldUsePlaceholderArt } from "@/lib/placeholder-art";
import type { GeneratedStory } from "@/domain/types";

/**
 * Ticket 197 (local 189) — exact 12-Page Story contract + deterministic
 * placeholder art.
 *
 * Acceptance criteria pinned here (each has a named test):
 *   C1. Every R1 Storybook contains exactly twelve sequential Pages/Scenes.
 *   C2. A Character-only Brief produces twelve readable Pages, `draft`,
 *       deterministic placeholder art, and zero fal image calls.
 *   C3. A Brief selecting an unconfirmed Persona is rejected with a typed
 *       likeness-gate error before text or image spend (never downgraded).
 *   C4. Placeholder art contains no raw photo, LoRA, provider URL, or
 *       likeness data.
 *   C5. Invalid schema / missing Style Bible / unselected Persona ID /
 *       refusal / truncation fails before image spend and releases the
 *       Story reservation.
 *   C6. A failed image Page stays a re-rollable hole and does not fail a
 *       valid 12-Page Storybook.
 *   C7. A Page re-roll creates a new candidate, preserves prior candidates,
 *       and consumes the bounded Storybook re-roll budget.
 *   C8. A re-roll over the budget returns a typed cap error without a
 *       provider call.
 *   C9. Finalization persists exactly one selected candidate per Page and
 *       rejects a Storybook with an unresolved Page.
 */

async function guardianWithCharacter(
  ctx: ReturnType<typeof createTestContext>,
  email = "char189@example.com",
  name = "Coco the Cat"
) {
  const guardian = ctx.onboarding.ensureFamilyForNewUser(`auth-189-${email}`, email);
  withActiveSubscription(ctx, guardian);
  const character = await ctx.characters.create({
    memberId: guardian.id,
    questionnaire: { name, topics: ["Curious", "Cuddly"], isFictional: true },
  });
  return { guardian, character };
}

async function readyPersona(ctx: ReturnType<typeof createTestContext>, email = "persona189@example.com") {
  const guardian = ctx.onboarding.ensureFamilyForNewUser(`auth-189-${email}`, email);
  withActiveSubscription(ctx, guardian);
  const persona = await ctx.personas.createAdult({
    memberId: guardian.id,
    displayName: "Star",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  return { guardian, persona };
}

async function readyPersonaBook(ctx: ReturnType<typeof createTestContext>) {
  const { guardian, persona } = await readyPersona(ctx);
  const book = await generateAndWait(ctx, guardian.id, {
    starringPersonaIds: [persona.id],
    storyType: "bedtime",
    theme: "a calm bedtime",
  });
  return { ctx, guardian, persona, book };
}

/** A structurally valid GeneratedStory fixture (12 pages/scenes). */
function validStory(personaIds: string[] = []): GeneratedStory {
  return {
    text: "Once upon a time...",
    pages: Array.from({ length: 12 }, (_, index) => ({ index, text: `Page ${index + 1} text` })),
    scenes: Array.from({ length: 12 }, (_, pageIndex) => ({
      pageIndex,
      description: `Scene ${pageIndex + 1}`,
      personaIds,
    })),
    styleBible: {
      palette: "warm pastels",
      artStyle: "watercolor",
      wardrobe: Object.fromEntries(personaIds.map((id) => [id, "soft blue pajamas"])),
    },
  };
}

describe("189 — C2/C4: Character-only Brief → deterministic placeholder art, zero fal", () => {
  it("C2: produces exactly twelve sequential readable Pages, `draft`, and ZERO fal image calls", async () => {
    const ctx = createTestContext();
    const { guardian, character } = await guardianWithCharacter(ctx);

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [],
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "Coco's cozy night",
    });
    await ctx.workflow.drain();

    // Zero fal image calls is the headline contract of the free path (FAIL-3).
    expect(ctx.fal.imageCalls).toBe(0);

    const stored = ctx.store.getStorybook(book.id, guardian.id)!;
    expect(stored.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(pages.map((p) => p.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
    // Every Page has deterministic local placeholder art, not a hole.
    expect(pages.every((p) => p.generationStatus === "ready")).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey?.endsWith(".svg"))).toBe(true);

    const textAttempt = [...ctx.store.providerCostLedgerEntries.values()].find(
      (entry) => entry.owningEntityIds.storybookId === book.id && entry.attemptType === "text"
    );
    expect(textAttempt?.units.input_tokens).toBeGreaterThan(0);
    expect(textAttempt?.units.output_tokens).toBeGreaterThan(0);
    expect(textAttempt?.actualCostUsd).toBeNull();
  });

  it("C2/C4: stored placeholder bytes are deterministic local SVG, identical per (storybookId, pageIndex)", async () => {
    const ctx = createTestContext();
    const { guardian, character } = await guardianWithCharacter(ctx);

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [],
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "deterministic art",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    for (const page of pages) {
      const bytes = await ctx.blobs.get(page.illustrationBlobKey!);
      expect(bytes).not.toBeNull();
      // Deterministic: the stored bytes are exactly the local renderer output.
      expect(
        bytes!.equals(renderPlaceholderArtSvg({ storybookId: book.id, pageIndex: page.index }))
      ).toBe(true);
    }

    // The renderer itself is a pure function of (storybookId, pageIndex).
    expect(
      renderPlaceholderArtSvg({ storybookId: "b", pageIndex: 0 }).equals(
        renderPlaceholderArtSvg({ storybookId: "b", pageIndex: 0 })
      )
    ).toBe(true);
    expect(
      renderPlaceholderArtSvg({ storybookId: "b", pageIndex: 0 }).equals(
        renderPlaceholderArtSvg({ storybookId: "b", pageIndex: 1 })
      )
    ).toBe(false);
    expect(
      renderPlaceholderArtSvg({ storybookId: "b", pageIndex: 0 }).equals(
        renderPlaceholderArtSvg({ storybookId: "c", pageIndex: 0 })
      )
    ).toBe(false);
  });

  it("C4: placeholder bytes contain no raw photo, LoRA key, provider URL, or likeness data", async () => {
    const ctx = createTestContext();
    const { guardian, character } = await guardianWithCharacter(
      ctx,
      "no-leak@example.com",
      "Pip the Dragon"
    );

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [],
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "no likeness data",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.length).toBe(12);
    const banned = [
      "lora", // LoRA key
      "https://", // provider URL
      "example.com", // fake provider URL
      "data:image", // raw photo/base64
      "fal.ai",
      "fal-ai",
      character.displayName, // likeness/character data
      character.id,
    ];
    for (const page of pages) {
      const bytes = await ctx.blobs.get(page.illustrationBlobKey!);
      const text = bytes!.toString("utf8").toLowerCase();
      expect(text.startsWith("<svg")).toBe(true);
      for (const token of banned) {
        expect(text).not.toContain(token.toLowerCase());
      }
    }
  });

  it("C2: the placeholder decision is per-Brief — only persona-free Briefs use placeholder art", () => {
    expect(shouldUsePlaceholderArt({ starringPersonaIds: [] })).toBe(true);
    expect(shouldUsePlaceholderArt({ starringPersonaIds: ["p-1"] })).toBe(false);
  });

  it("C2: a Brief with a selected ready Persona still runs the fal pipeline (never placeholder)", async () => {
    const ctx = createTestContext();
    const { book } = await readyPersonaBook(ctx);
    expect(book.status).toBe("draft");
    expect(ctx.fal.imageCalls).toBe(12);
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.every((p) => p.generationStatus === "ready")).toBe(true);
  });

  it("C6: a failed image Page stays a re-rollable hole but never fails the book (text-viewable draft)", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "hole@example.com");
    ctx.fal.failImageOnPage = 1; // Page index 0 → page 1 fails
    ctx.fal.currentPage = 0;

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "a hole in the book",
    });

    expect(book.status).toBe("draft"); // not failed by one missing illustration
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(pages.filter((p) => p.generationStatus === "failed")).toHaveLength(1);
    // The hole is re-rollable: its text is intact and it has no illustration.
    const hole = pages.find((p) => p.generationStatus === "failed")!;
    expect(hole.text.length).toBeGreaterThan(0);
    expect(hole.illustrationBlobKey).toBeNull();
  });
});

describe("189 — C3: typed likeness-gate rejection before spend", () => {
  it("C3: an unconfirmed ready Persona is rejected with LikenessGateError before text or image spend", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    const spy = vi.spyOn(ctx.anthropic, "generateStory");

    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "should be blocked",
      })
    ).rejects.toBeInstanceOf(LikenessGateError);

    expect(spy).not.toHaveBeenCalled(); // zero text spend
    expect(ctx.fal.imageCalls).toBe(0); // zero image spend
    expect(ctx.store.listStorybooksForBaby(baby.id, guardian.id)).toHaveLength(0);
  });

  it("C3: an unconfirmed Persona is never silently downgraded to placeholder art", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Mr. Moon", topics: ["Wise"], isFictional: true },
    });

    // Brief selects the unconfirmed persona AND a character — the gate must
    // reject, never fall through to the placeholder path.
    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        starringCharacterIds: [character.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "never a silent downgrade",
      })
    ).rejects.toBeInstanceOf(LikenessGateError);
    expect(ctx.fal.imageCalls).toBe(0);
  });

  it("C3: a Persona in `review` (post-training, unconfirmed) is rejected with LikenessGateError", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    babyPersona.status = "review"; // canonical post-training state (PRD v22)
    ctx.store.savePersona(babyPersona);

    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "review persona",
      })
    ).rejects.toBeInstanceOf(LikenessGateError);
    expect(ctx.anthropic.calls).toHaveLength(0);
  });

  it("C3: a failed Persona is rejected with the same typed gate (message still says not ready)", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    babyPersona.status = "failed";
    ctx.store.savePersona(babyPersona);

    const brief = {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime" as const,
      theme: "failed persona",
    };
    await expect(ctx.storybooks.generate(guardian.id, brief)).rejects.toBeInstanceOf(
      LikenessGateError
    );
    await expect(ctx.storybooks.generate(guardian.id, brief)).rejects.toThrow(/not ready/i);
  });
});

describe("189 — C5: invalid text fails before image spend and releases the reservation", () => {
  it("C5: wrong Page/Scene count fails terminal with zero fal calls and a released reservation", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "count@example.com");
    const failing = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "invalid count",
    });
    const short = validStory([persona.id]);
    short.pages = short.pages.slice(0, 3);
    short.scenes = short.scenes.slice(0, 3);
    vi.spyOn(ctx.anthropic, "generateStory").mockResolvedValue(short);

    await ctx.workflow.drain();

    const stored = ctx.store.getStorybook(failing.id, guardian.id)!;
    expect(stored.status).toBe("failed");
    expect(ctx.fal.imageCalls).toBe(0); // zero image spend
    expect(ctx.store.getPagesForStorybook(failing.id)).toHaveLength(0);
    expect(ctx.storyCap.getReservationAudit(failing.id)?.status).toBe("released");
  });

  it("C5: a missing Style Bible fails before image spend and releases the reservation", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "bible@example.com");
    const failing = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "no style bible",
    });
    const story = validStory([persona.id]);
    story.styleBible = { palette: "", artStyle: "", wardrobe: {} };
    vi.spyOn(ctx.anthropic, "generateStory").mockResolvedValue(story);

    await ctx.workflow.drain();

    expect(ctx.store.getStorybook(failing.id, guardian.id)!.status).toBe("failed");
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.storyCap.getReservationAudit(failing.id)?.status).toBe("released");
  });

  it("C5: a Scene referencing an unselected Persona ID fails before image spend", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "unselected@example.com");
    const failing = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "unselected persona",
    });
    const story = validStory([persona.id]);
    story.scenes = story.scenes.map((s) => ({ ...s, personaIds: ["some-other-persona"] }));
    vi.spyOn(ctx.anthropic, "generateStory").mockResolvedValue(story);

    await ctx.workflow.drain();

    expect(ctx.store.getStorybook(failing.id, guardian.id)!.status).toBe("failed");
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.storyCap.getReservationAudit(failing.id)?.status).toBe("released");
  });

  it("C5: provider refusal fails terminal before image spend and releases the reservation", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "refused@example.com");
    const failing = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "refused",
    });
    vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(
      new Error("Story generation was refused by the model's safety system")
    );

    await expect(ctx.workflow.drain()).rejects.toThrow(/refused/i);

    expect(ctx.store.getStorybook(failing.id, guardian.id)!.status).toBe("failed");
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.storyCap.getReservationAudit(failing.id)?.status).toBe("released");
  });

  it("C5: truncation (max_tokens) fails terminal before image spend and releases the reservation", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "truncated@example.com");
    const failing = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "truncated",
    });
    vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(
      new Error("Story generation hit the max_tokens limit (truncated JSON)")
    );

    await expect(ctx.workflow.drain()).rejects.toThrow(/max_tokens/i);

    expect(ctx.store.getStorybook(failing.id, guardian.id)!.status).toBe("failed");
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.storyCap.getReservationAudit(failing.id)?.status).toBe("released");
  });
});

describe("189 — C7/C8: re-roll candidates, budget, and the typed cap error", () => {
  it("C7: each re-roll creates a new candidate, preserves prior ones, and consumes the budget", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    const before = ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining;

    ctx.storybooks.rerollImage(guardian.id, page.id);
    ctx.storybooks.rerollImage(guardian.id, page.id);

    const candidates = ctx.store.getCandidatesForPage(page.id);
    expect(candidates.map((c) => c.id)).toEqual([`${page.id}-reroll-1`, `${page.id}-reroll-2`]);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining).toBe(before - 2);
    // The pipeline's original page state is untouched by re-rolls.
    expect(ctx.store.pages.get(page.id)!.text).toBe(page.text);
  });

  it("C8: a re-roll over the budget throws the typed RerollBudgetError without a provider call", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    book.rerollBudgetRemaining = 0;
    book.rerollCredits = 0;
    ctx.store.saveStorybook(book);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    const callsBefore = ctx.fal.imageCalls;

    expect(() => ctx.storybooks.rerollImage(guardian.id, page.id)).toThrow(RerollBudgetError);
    expect(ctx.fal.imageCalls).toBe(callsBefore); // no provider call
    expect(ctx.store.getCandidatesForPage(page.id)).toHaveLength(0);
  });

  it("C8: buying credits restores re-rolls after the typed cap error", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    book.rerollBudgetRemaining = 0;
    book.rerollCredits = 0;
    ctx.store.saveStorybook(book);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;

    expect(() => ctx.storybooks.rerollImage(guardian.id, page.id)).toThrow(RerollBudgetError);
    ctx.storybooks.buyRerollCredits(guardian.id, book.id, 1);
    ctx.storybooks.rerollImage(guardian.id, page.id);
    expect(ctx.store.getCandidatesForPage(page.id)).toHaveLength(1);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.rerollCredits).toBe(0);
  });

  it("C7: reroll uses deterministic local PNG bytes, never an external placeholder URL", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;

    ctx.storybooks.rerollImage(guardian.id, page.id);
    const candidate = ctx.store.getCandidatesForPage(page.id)[0]!;

    expect(candidate.content).toMatch(/^data:image\/png;base64,/);
    expect(candidate.content).not.toMatch(/example\.com|lora|photo|likeness|https?:/i);
    expect(ctx.fal.imageCalls).toBe(12);
  });

  it("C7: repeated delivery with one idempotency key creates one candidate and spends once", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    const before = ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining;

    ctx.storybooks.rerollImage(guardian.id, page.id, "reroll-request-1");
    ctx.storybooks.rerollImage(guardian.id, page.id, "reroll-request-1");

    expect(ctx.store.getCandidatesForPage(page.id)).toHaveLength(1);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining).toBe(before - 1);
  });

  it("C7: reroll is draft-only and cannot spend finalized-book budget", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    ctx.storybooks.finalize(guardian.id, book.id);
    const before = ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining;

    expect(() => ctx.storybooks.rerollImage(guardian.id, page.id)).toThrow(/draft/i);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining).toBe(before);
    expect(ctx.store.getCandidatesForPage(page.id)).toHaveLength(0);
  });
});

describe("189 — red-team lifecycle and generation integrity", () => {
  it("finalization rejects an incomplete Page set instead of finalizing what happens to exist", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const pages = ctx.store.getPagesForStorybook(book.id);
    ctx.store.pages.delete(pages[11]!.id);

    expect(() => ctx.storybooks.finalize(guardian.id, book.id)).toThrow(UnresolvedPageError);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("draft");
  });

  it("finalization rejects non-sequential Page indexes", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    page.index = 4;
    ctx.store.savePage(page);

    expect(() => ctx.storybooks.finalize(guardian.id, book.id)).toThrow(UnresolvedPageError);
  });

  it("finalization rejects a selected candidate whose persisted blob is missing", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    ctx.storybooks.rerollImage(guardian.id, page.id);
    const candidate = ctx.store.getCandidatesForPage(page.id)[0]!;

    await ctx.storybooks.selectCandidate(guardian.id, candidate.id);
    expect(page.illustrationBlobKey).toBeTruthy();
    await ctx.blobs.delete(page.illustrationBlobKey!);

    await expect(ctx.storybooks.finalizeAsync(guardian.id, book.id)).rejects.toThrow(
      UnresolvedPageError
    );
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("draft");
  });

  it("watchdog fails a stranded generation with incomplete persisted Pages", async () => {
    const ctx = createTestContext();
    const { guardian, character } = await guardianWithCharacter(ctx, "watchdog-incomplete@example.com");
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [],
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "incomplete watchdog",
      pageCount: 12,
    }, { deferEnqueue: true });
    const story = validStory();
    ctx.store.savePersistedGeneration({
      storybookId: book.id,
      story: { ...story, pages: story.pages.slice(0, 11), scenes: story.scenes.slice(0, 11) },
      persistedAt: new Date(),
    });

    const past = new Date(book.createdAt.getTime() + 5 * 60 * 1000 + 1);
    expect(ctx.storybooks.reapStrandedGenerations(past)).toBe(1);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("failed");
  });

  it("preserves the model-selected Persona subset on each Scene/Page request", async () => {
    const ctx = createTestContext();
    const { guardian, persona: first } = await readyPersona(ctx, "scene-one@example.com");
    const second = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Second",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie-2"),
    });
    const story = validStory([first.id, second.id]);
    story.scenes = story.scenes.map((scene, index) => ({
      ...scene,
      personaIds: index % 2 === 0 ? [first.id] : [second.id],
    }));
    vi.spyOn(ctx.anthropic, "generateStory").mockResolvedValue(story);
    const falSpy = vi.spyOn(ctx.fal, "generatePageImage");

    await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [first.id, second.id],
      storyType: "bedtime",
      theme: "scene cast",
    });

    expect(falSpy.mock.calls.map(([request]) => request.personaIds)).toEqual(
      Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? [first.id] : [second.id]))
    );
  });
});

describe("189 — C9: finalization persists exactly one selected candidate per Page", () => {
  it("C9: finalize rejects a Page with re-roll candidates but none selected (typed, book untouched)", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    ctx.storybooks.rerollImage(guardian.id, page.id); // candidate exists, unselected

    expect(() => ctx.storybooks.finalize(guardian.id, book.id)).toThrow(UnresolvedPageError);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("draft"); // untouched
    expect(ctx.store.getStorybook(book.id, guardian.id)!.finalizedAt).toBeNull();
  });

  it("C9: finalize rejects a Page with multiple selected candidates", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    ctx.store.savePageCandidate({
      id: `${page.id}-reroll-1`,
      pageId: page.id,
      kind: "image",
      content: "memory://one",
      selected: true,
      createdAt: new Date(),
    });
    ctx.store.savePageCandidate({
      id: `${page.id}-reroll-2`,
      pageId: page.id,
      kind: "image",
      content: "memory://two",
      selected: true,
      createdAt: new Date(),
    });

    expect(() => ctx.storybooks.finalize(guardian.id, book.id)).toThrow(UnresolvedPageError);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("draft");
  });

  it("C9: finalize rejects an unresolved illustration hole (no candidates, no art)", async () => {
    const ctx = createTestContext();
    const { guardian, persona } = await readyPersona(ctx, "hole-fin@example.com");
    ctx.fal.failImageOnPage = 1;
    ctx.fal.currentPage = 0;
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "hole cannot finalize",
    });
    expect(book.status).toBe("draft");

    expect(() => ctx.storybooks.finalize(guardian.id, book.id)).toThrow(UnresolvedPageError);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("draft");
  });

  it("C9: selecting the single candidate then finalizing persists exactly that selection", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    ctx.storybooks.rerollImage(guardian.id, page.id);
    const candidate = ctx.store.getCandidatesForPage(page.id)[0]!;

    const globalFetch = global.fetch;
    global.fetch = async () =>
      ({
        ok: true,
        arrayBuffer: async () => Buffer.from("chosen-image-bytes"),
      }) as unknown as Response;
    try {
      await ctx.storybooks.selectCandidate(guardian.id, candidate.id);
    } finally {
      global.fetch = globalFetch;
    }

    const finalized = ctx.storybooks.finalize(guardian.id, book.id);
    expect(finalized.status).toBe("finalized");
    const finalizedPage = ctx.store.pages.get(page.id)!;
    // The persisted Page illustration IS the single selected candidate.
    expect(finalizedPage.illustrationBlobKey).toBe(
      `${book.id}/pages/${page.id}/selected-${candidate.id}.png`
    );
    const bytes = await ctx.blobs.get(finalizedPage.illustrationBlobKey!);
    expect(bytes!.toString()).toBe("chosen-image-bytes");
  });

  it("C9: a normal pipeline-ready draft (no candidates) still finalizes", async () => {
    const ctx = createTestContext();
    const { guardian, book } = await readyPersonaBook(ctx);

    const finalized = ctx.storybooks.finalize(guardian.id, book.id);
    expect(finalized.status).toBe("finalized");
    expect(finalized.finalizedAt).toBeInstanceOf(Date);
  });
});

describe("189 — C1: the exact 12-Page Story contract (R1)", () => {
  it("C1: default R1 rejects a non-12 Page Brief before any text spend", async () => {
    vi.stubEnv("R1_MULTI_FAMILY_ENABLED", "false");
    vi.stubEnv("R1_ONE_PLAN", "false");
    try {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx, "default-r1-short@example.com");

      await expect(
        ctx.storybooks.generate(guardian.id, {
          starringPersonaIds: [],
          starringCharacterIds: [character.id],
          storyType: "bedtime",
          theme: "default r1 short",
          pageCount: 5,
        })
      ).rejects.toThrow(/exactly 12 Pages/i);
      expect(ctx.anthropic.calls).toHaveLength(0);
      expect(ctx.fal.imageCalls).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("C1: under R1_ONE_PLAN a non-12 pageCount Brief is rejected before any text spend", async () => {
    vi.stubEnv("R1_ONE_PLAN", "true");
    try {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx, "r1-short@example.com");

      await expect(
        ctx.storybooks.generate(guardian.id, {
          starringPersonaIds: [],
          starringCharacterIds: [character.id],
          storyType: "bedtime",
          theme: "too short",
          pageCount: 5,
        })
      ).rejects.toThrow(/exactly 12 Pages/i);
      expect(ctx.anthropic.calls).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("C1: under R1_ONE_PLAN a generated book is exactly twelve sequential Pages/Scenes", async () => {
    vi.stubEnv("R1_ONE_PLAN", "true");
    try {
      const ctx = createTestContext();
      const { guardian, character } = await guardianWithCharacter(ctx, "r1-full@example.com");

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "exactly twelve",
        pageCount: 12,
      });
      await ctx.workflow.drain();

      const stored = ctx.store.getStorybook(book.id, guardian.id)!;
      expect(stored.status).toBe("draft");
      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages).toHaveLength(12);
      expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      // One Scene per Page (the persisted text pass carried 12 scenes).
      const persisted = ctx.store.getPersistedGeneration(book.id)!;
      expect(persisted.story.scenes).toHaveLength(12);
      expect(persisted.story.scenes.map((s) => s.pageIndex)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
