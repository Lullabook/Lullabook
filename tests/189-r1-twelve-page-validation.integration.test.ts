import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";
import { RerollBudgetError } from "@/services/storybook";

/**
 * Ticket 197 (local 189) — R1 exact-12 validation + the finalize/select/reroll
 * HTTP surface.
 *
 * Route-level integration over the same in-memory context the service tests
 * use (bearer-auth mocked, same pattern as tests/169): the R1 Story contract
 * is enforced at the creation boundary, and finalization rejects unresolved
 * Pages over the wire with the book untouched.
 */
const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext<import("@/adapters/fakes").FakeFal>> | null,
  authSub: "guardian-189",
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => harness.ctx!,
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async (token: string) => {
      if (token === "bad") throw new Error("invalid");
      return { sub: harness.authSub, email: "guardian189@example.com", jurisdiction: "US" };
    },
  }),
}));

import { POST as finalizePost } from "@/app/api/storybooks/[id]/finalize/route";
import { POST as selectPost } from "@/app/api/storybooks/candidates/[candidateId]/select/route";
import { POST as rerollPost } from "@/app/api/storybooks/pages/[pageId]/reroll-image/route";

function bearerRequest(path: string, token = "good", extraHeaders: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
}

describe("189 — R1 exact-12 Story contract at the creation boundary", () => {
  it("rejects a non-12 Page Brief before any provider spend (R1)", async () => {
    vi.stubEnv("R1_ONE_PLAN", "true");
    try {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-189", "g@example.com");
      withActiveSubscription(ctx, guardian);
      const character = await ctx.characters.create({
        memberId: guardian.id,
        questionnaire: { name: "Coco", topics: ["Curious"], isFictional: true },
      });

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
      expect(ctx.fal.imageCalls).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("accepts exactly twelve Pages/Scenes and the book is a twelve-Page draft (R1)", async () => {
    vi.stubEnv("R1_ONE_PLAN", "true");
    try {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-189", "g@example.com");
      withActiveSubscription(ctx, guardian);

      const book = await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [],
        starringCharacterIds: [],
        storyType: "bedtime",
        theme: "twelve exactly",
        pageCount: 12,
      });
      expect(book.status).toBe("draft");
      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("189 — POST /api/storybooks/pages/[pageId]/reroll-image", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    harness.ctx = null;
  });

  async function draftBook() {
    const ctx = harness.ctx!;
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-189", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "reroll via route",
    });
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    return { ctx, guardian, book, page };
  }

  it("creates a new candidate per re-roll, preserving prior candidates (200)", async () => {
    const { ctx, guardian, page, book } = await draftBook();
    const budgetBefore = ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining;

    const res1 = await rerollPost(bearerRequest(`/api/storybooks/pages/${page.id}/reroll-image`), {
      params: Promise.resolve({ pageId: page.id }),
    });
    expect(res1.status).toBe(200);
    expect((await res1.json()).rerolled).toBe(true);

    const res2 = await rerollPost(bearerRequest(`/api/storybooks/pages/${page.id}/reroll-image`), {
      params: Promise.resolve({ pageId: page.id }),
    });
    expect(res2.status).toBe(200);

    const candidates = ctx.store.getCandidatesForPage(page.id);
    expect(candidates.map((c) => c.id)).toEqual([`${page.id}-reroll-1`, `${page.id}-reroll-2`]);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining).toBe(
      budgetBefore - 2
    );
  });

  it("over the budget returns a typed cap error (400) with no provider call", async () => {
    const { ctx, guardian, page, book } = await draftBook();
    const stored = ctx.store.getStorybook(book.id, guardian.id)!;
    stored.rerollBudgetRemaining = 0;
    stored.rerollCredits = 0;
    ctx.store.saveStorybook(stored);
    const callsBefore = ctx.fal.imageCalls;

    const res = await rerollPost(bearerRequest(`/api/storybooks/pages/${page.id}/reroll-image`), {
      params: Promise.resolve({ pageId: page.id }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/budget/i);
    expect(ctx.fal.imageCalls).toBe(callsBefore);
    expect(ctx.store.getCandidatesForPage(page.id)).toHaveLength(0);
  });

  it("replayed Idempotency-Key returns the same local reroll without a second budget debit", async () => {
    const { ctx, guardian, page, book } = await draftBook();
    const budgetBefore = ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining;
    const path = `/api/storybooks/pages/${page.id}/reroll-image`;

    const res1 = await rerollPost(bearerRequest(path, "good", { "Idempotency-Key": "route-reroll-1" }), {
      params: Promise.resolve({ pageId: page.id }),
    });
    const res2 = await rerollPost(bearerRequest(path, "good", { "Idempotency-Key": "route-reroll-1" }), {
      params: Promise.resolve({ pageId: page.id }),
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(ctx.store.getCandidatesForPage(page.id)).toHaveLength(1);
    expect(ctx.store.getStorybook(book.id, guardian.id)!.rerollBudgetRemaining).toBe(
      budgetBefore - 1
    );
  });

  it("exposes the typed error class at the seam (RerollBudgetError)", async () => {
    const { ctx, guardian, page, book } = await draftBook();
    const stored = ctx.store.getStorybook(book.id, guardian.id)!;
    stored.rerollBudgetRemaining = 0;
    stored.rerollCredits = 0;
    ctx.store.saveStorybook(stored);

    expect(() => ctx.storybooks.rerollImage(guardian.id, page.id)).toThrow(RerollBudgetError);
  });
});

describe("189 — POST /api/storybooks/candidates/[candidateId]/select + finalize", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    harness.ctx = null;
  });

  async function draftBookWithReroll() {
    const ctx = harness.ctx!;
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-189", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "finalize via route",
    });
    const page = ctx.store.getPagesForStorybook(book.id)[0]!;
    ctx.storybooks.rerollImage(guardian.id, page.id);
    const candidate = ctx.store.getCandidatesForPage(page.id)[0]!;
    return { ctx, guardian, book, page, candidate };
  }

  it("finalize rejects an unresolved Page (candidates, none selected) over the wire; book untouched", async () => {
    const { ctx, guardian, book } = await draftBookWithReroll();

    const res = await finalizePost(bearerRequest(`/api/storybooks/${book.id}/finalize`), {
      params: Promise.resolve({ id: book.id }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/candidates|Page|unresolved/i);
    // E4: the draft is untouched by the rejection.
    const after = ctx.store.getStorybook(book.id, guardian.id)!;
    expect(after.status).toBe("draft");
    expect(after.finalizedAt).toBeNull();
  });

  it("select then finalize persists exactly the selected candidate (200 finalized)", async () => {
    const { ctx, guardian, book, page, candidate } = await draftBookWithReroll();

    const globalFetch = global.fetch;
    global.fetch = async () =>
      ({
        ok: true,
        arrayBuffer: async () => Buffer.from("route-chosen-image"),
      }) as unknown as Response;
    try {
      const sel = await selectPost(
        bearerRequest(`/api/storybooks/candidates/${candidate.id}/select`),
        { params: Promise.resolve({ candidateId: candidate.id }) }
      );
      expect(sel.status).toBe(200);
      expect((await sel.json()).selected).toBe(true);

      const fin = await finalizePost(bearerRequest(`/api/storybooks/${book.id}/finalize`), {
        params: Promise.resolve({ id: book.id }),
      });
      expect(fin.status).toBe(200);
      expect((await fin.json()).finalized).toBe(true);
    } finally {
      global.fetch = globalFetch;
    }

    const saved = ctx.store.getStorybook(book.id, guardian.id)!;
    expect(saved.status).toBe("finalized");
    expect(saved.finalizedAt).toBeInstanceOf(Date);
    const savedPage = ctx.store.pages.get(page.id)!;
    expect(savedPage.illustrationBlobKey).toBe(
      `${book.id}/pages/${page.id}/selected-${candidate.id}.png`
    );
  });

  it("a pipeline-ready draft (no candidates) finalizes over the wire", async () => {
    const ctx = harness.ctx!;
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian-189", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "plain finalize",
    });

    const res = await finalizePost(bearerRequest(`/api/storybooks/${book.id}/finalize`), {
      params: Promise.resolve({ id: book.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).finalized).toBe(true);
  });
});
