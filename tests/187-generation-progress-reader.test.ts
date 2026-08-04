import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestContext,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";
import type { RequestContext } from "@/lib/context";
import type { Member } from "@/domain/types";
import { deriveStorybookProgress } from "@/lib/storybook-progress";
import {
  READER_POLL_BUDGET_MS,
  READER_POLL_INTERVAL_MS,
  generationProgressCopy,
  isPollBudgetExhausted,
  isTerminalStatus,
  shouldPollStorybook,
} from "../mobile/lib/generation-flow";

/**
 * Issue 187 — server-derived generation progress + progressive reader state.
 *
 * Acceptance criteria under test (each has a named test below):
 *   A1. GET /api/storybooks/:id returns progress.phase / progress.pagesReady /
 *       progress.pagesTotal for an authorized Family.
 *   A2. The reader renders Story text and the current server-derived Page
 *       count while the Storybook is `generating`.
 *   A4. Polling stops on draft/failed/finalized; a five-minute watchdog
 *       renders a terminal timeout state.
 *
 * Server logic is tested via the in-memory store + the route body (same
 * resolveRequestAuth-spy pattern as tests/160); mobile decision logic is
 * pure and dependency-free (same pattern as tests/170/173).
 */

const ROOT = process.cwd();
const readMobile = (p: string) => readFileSync(join(ROOT, "mobile", p), "utf8");

/** Stub cookie/bearer resolution so route tests drive the route body itself. */
async function mockAuth(authed: { ctx: unknown; member: Member } | null): Promise<void> {
  vi.spyOn(await import("@/lib/request-auth"), "resolveRequestAuth").mockResolvedValue(
    authed ? { ctx: authed.ctx as RequestContext, member: authed.member } : null
  );
}

async function generatingBookFixture() {
  const ctx = createTestContext();
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-187", "progress@example.com");
  withActiveSubscription(ctx, member);
  const persona = await ctx.personas.createAdult({
    memberId: member.id,
    displayName: "Star",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  const book = await ctx.storybooks.generate(member.id, {
    starringPersonaIds: [persona.id],
    storyType: "bedtime",
    theme: "A night on the moon",
  });
  // The request boundary is non-blocking: `generating`, zero provider work.
  expect(book.status).toBe("generating");
  expect(ctx.anthropic.calls).toHaveLength(0);
  return { ctx, member, book };
}

async function getProgress(
  ctx: ReturnType<typeof createTestContext>,
  member: Member,
  id: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/storybooks/[id]/route");
  const res = await GET(new Request(`http://localhost/api/storybooks/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("187 — A1: GET /api/storybooks/:id publishes server-derived progress", () => {
  it("returns progress for an authorized Family while the book is `generating` (writing phase, 0/12)", { timeout: 20_000 }, async () => {
    const { ctx, member, book } = await generatingBookFixture();
    await mockAuth({ ctx, member });

    const { status, body } = await getProgress(ctx, member, book.id);
    expect(status).toBe(200);
    expect(body.id).toBe(book.id);
    expect(body.status).toBe("generating");
    expect(body.progress).toEqual({ phase: "writing", pagesReady: 0, pagesTotal: 12 });
  });

  it("additive: existing response fields (theme, storyType, pages, reroll) stay intact", { timeout: 20_000 }, async () => {
    const { ctx, member, book } = await generatingBookFixture();
    await mockAuth({ ctx, member });

    const { body } = await getProgress(ctx, member, book.id);
    expect(body.theme).toBe("A night on the moon");
    expect(body.storyType).toBe("bedtime");
    expect(body.rerollBudgetRemaining).toBeTypeOf("number");
    expect(Array.isArray(body.pages)).toBe(true);
    expect((body.pages as unknown[]).length).toBe(0);
  });

  it("mid-run: once text is persisted, phase is `illustrating` and pagesReady tracks ready Pages", { timeout: 20_000 }, async () => {
    const { ctx, member, book } = await generatingBookFixture();
    // Simulate the text pass committing, then 3 of 12 Pages turning ready —
    // exactly the durable state the route derives progress from.
    ctx.store.savePersistedGeneration({
      storybookId: book.id,
      story: ctx.anthropic.response,
      persistedAt: new Date(),
    });
    for (let i = 0; i < 3; i++) {
      ctx.store.savePage({
        id: `${book.id}-p${i}`,
        storybookId: book.id,
        index: i,
        text: `Page ${i + 1} text`,
        illustrationUrl: null,
        illustrationBlobKey: i % 2 === 0 ? `books/f/books/${book.id}/page-${i}.png` : null,
        videoBlobKey: null,
        videoUrl: null,
        voiceClipId: null,
        generationStatus: "ready",
        personaCount: 1,
      });
    }
    // A failed Page is a re-rollable hole, never counted as ready.
    ctx.store.savePage({
      id: `${book.id}-p4`,
      storybookId: book.id,
      index: 4,
      text: "Page 5 text",
      illustrationUrl: null,
      illustrationBlobKey: null,
      videoBlobKey: null,
      videoUrl: null,
      voiceClipId: null,
      generationStatus: "failed",
      personaCount: 1,
    });
    await mockAuth({ ctx, member });

    const { body } = await getProgress(ctx, member, book.id);
    expect(body.progress).toEqual({ phase: "illustrating", pagesReady: 3, pagesTotal: 12 });
    // The wire also carries the ready Pages' text so the reader can render
    // Story text before every Page is terminal (A2).
    expect(
      (body.pages as { index: number; text: string }[]).find((p) => p.index === 0)?.text
    ).toBe("Page 1 text");
  });

  it("terminal: a `draft` book reports phase `complete` with full ready count", { timeout: 20_000 }, async () => {
    const { ctx, member, book } = await generatingBookFixture();
    await ctx.workflow.drain();
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("draft");
    await mockAuth({ ctx, member });

    const { body } = await getProgress(ctx, member, book.id);
    expect(body.status).toBe("draft");
    expect(body.progress).toEqual({ phase: "complete", pagesReady: 12, pagesTotal: 12 });
  });

  it("terminal: a `failed` book reports phase `failed`", { timeout: 20_000 }, async () => {
    const { ctx, member, book } = await generatingBookFixture();
    vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(new Error("Claude outage"));
    await expect(ctx.workflow.drain()).rejects.toThrow("Claude outage");
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("failed");
    await mockAuth({ ctx, member });

    const { body } = await getProgress(ctx, member, book.id);
    expect(body.status).toBe("failed");
    expect(body.progress).toEqual({ phase: "failed", pagesReady: 0, pagesTotal: 12 });
  });

  it("returns 401 for an unauthenticated request", async () => {
    await mockAuth(null);
    const { GET } = await import("@/app/api/storybooks/[id]/route");
    const res = await GET(new Request("http://localhost/api/storybooks/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the same non-disclosing 404 for a cross-Family Storybook probe", { timeout: 20_000 }, async () => {
    const { ctx, member, book } = await generatingBookFixture();
    const stranger = ctx.onboarding.ensureFamilyForNewUser("auth-187-stranger", "stranger@example.com");
    const reap = vi.spyOn(ctx.storybooks, "reapStrandedGenerationsDurably");
    await mockAuth({ ctx, member: stranger });

    const { status, body } = await getProgress(ctx, stranger, book.id);
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
    // A foreign probe must not trigger the global watchdog or mutate the
    // other Family's book/allowance as an existence side effect.
    expect(reap).not.toHaveBeenCalled();
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("generating");
  });
});

describe("187 — A1: deriveStorybookProgress projection", () => {
  const brief = {
    starringPersonaIds: [] as string[],
    storyType: "bedtime" as const,
    theme: "x",
  };
  const page = (index: number, generationStatus: import("@/domain/types").PageGenerationStatus) => ({
    id: `p${index}`,
    storybookId: "b",
    index,
    text: "t",
    illustrationUrl: null,
    illustrationBlobKey: null,
    videoBlobKey: null,
    videoUrl: null,
    voiceClipId: null,
    generationStatus,
    personaCount: 1,
  });

  it("writing: generating with no persisted text", () => {
    expect(
      deriveStorybookProgress({ status: "generating", brief, pages: [], hasPersistedText: false })
    ).toEqual({ phase: "writing", pagesReady: 0, pagesTotal: 12 });
  });

  it("illustrating: generating with persisted text", () => {
    expect(
      deriveStorybookProgress({ status: "generating", brief, pages: [], hasPersistedText: true })
    ).toEqual({ phase: "illustrating", pagesReady: 0, pagesTotal: 12 });
  });

  it("pagesTotal honors the Brief's pageCount (server-derived planned total)", () => {
    expect(
      deriveStorybookProgress({
        status: "generating",
        brief: { ...brief, pageCount: 5 },
        pages: [],
        hasPersistedText: true,
      }).pagesTotal
    ).toBe(5);
  });

  it("pagesReady counts only `ready` Pages (failed/quarantined/pending are holes)", () => {
    const progress = deriveStorybookProgress({
      status: "generating",
      brief,
      pages: [
        page(0, "ready"),
        page(1, "failed"),
        page(2, "quarantined"),
        page(3, "pending"),
        page(4, "ready"),
      ],
      hasPersistedText: true,
    });
    expect(progress.pagesReady).toBe(2);
    expect(progress.pagesTotal).toBe(12);
  });

  it("complete: draft and finalized both project `complete`", () => {
    expect(deriveStorybookProgress({ status: "draft", brief, pages: [], hasPersistedText: true }).phase).toBe("complete");
    expect(deriveStorybookProgress({ status: "finalized", brief, pages: [], hasPersistedText: true }).phase).toBe("complete");
  });

  it("failed: status failed projects `failed`", () => {
    expect(deriveStorybookProgress({ status: "failed", brief, pages: [], hasPersistedText: false }).phase).toBe("failed");
  });
});

describe("187 — A4: polling-stop + watchdog are pure, bounded decisions", () => {
  it("isTerminalStatus stops polling on draft/failed/finalized; generating keeps polling", () => {
    expect(isTerminalStatus("draft")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("finalized")).toBe(true);
    expect(isTerminalStatus("generating")).toBe(false);
  });

  it("watchdog timeout stops polling, and clearing it for Retry resumes polling", () => {
    expect(shouldPollStorybook("generating", false)).toBe(true);
    expect(shouldPollStorybook("generating", true)).toBe(false);
    expect(shouldPollStorybook("draft", false)).toBe(false);
    expect(shouldPollStorybook("failed", false)).toBe(false);
    expect(shouldPollStorybook("finalized", false)).toBe(false);
  });

  it("a five-minute watchdog budget marks the poll exhausted at/past READER_POLL_BUDGET_MS", () => {
    expect(READER_POLL_BUDGET_MS).toBe(5 * 60 * 1000);
    const start = 1_000_000;
    expect(isPollBudgetExhausted(start, start + READER_POLL_BUDGET_MS - 1)).toBe(false);
    expect(isPollBudgetExhausted(start, start + READER_POLL_BUDGET_MS)).toBe(true);
    // A poll that never started is never "exhausted".
    expect(isPollBudgetExhausted(null, Date.now())).toBe(false);
  });

  it("the reader does not poll faster than the existing 2.5s cadence (40-request budget not worsened)", () => {
    expect(READER_POLL_INTERVAL_MS).toBe(2_500);
  });

  it("generationProgressCopy renders parent-facing phase copy, never a raw phase enum", () => {
    expect(generationProgressCopy({ phase: "writing", pagesReady: 0, pagesTotal: 12 })).toMatch(/writ/i);
    expect(generationProgressCopy({ phase: "illustrating", pagesReady: 3, pagesTotal: 12 })).toContain("3");
    expect(generationProgressCopy({ phase: "illustrating", pagesReady: 3, pagesTotal: 12 })).toContain("12");
    expect(generationProgressCopy({ phase: "complete", pagesReady: 12, pagesTotal: 12 })).toMatch(/read/i);
    expect(generationProgressCopy({ phase: "failed", pagesReady: 0, pagesTotal: 12 })).toMatch(/finish/i);
  });
});

describe("187 — A2/A4: reader source contract (text + server-derived count while generating)", () => {
  const src = readMobile("app/(tabs)/stories/[id].tsx");
  const api = readMobile("lib/api.ts");

  it("the wire carries server-derived progress (A1 client half)", () => {
    expect(api).toContain("progress:");
    expect(api).toContain("GenerationProgress");
    const flow = readMobile("lib/generation-flow.ts");
    expect(flow).toContain("pagesTotal");
    expect(flow).toContain("pagesReady");
  });

  it("while generating, a ready Page renders its Story text and the server-derived Page count", () => {
    // The generating branch must still render the page card (text + count),
    // not hide it behind a skeleton until terminal.
    const genBranch = src.slice(src.indexOf("generating && !pollTimedOut"), src.indexOf(") : page ? ("));
    expect(genBranch).toContain("PageTurn");
    expect(genBranch).toContain("pageText");
    // "Page N of M" uses the SERVER-derived total (progress.pagesTotal), not a client count.
    expect(genBranch).toMatch(/progress\.pagesTotal/);
  });

  it("polling stops on terminal statuses via the pure decision, and the watchdog is wired to the 5-minute budget", () => {
    expect(src).toContain("isTerminalStatus(");
    expect(src).toContain("READER_POLL_BUDGET_MS");
    expect(src).toContain("isPollBudgetExhausted(");
    expect(src).toContain("shouldPollStorybook(");
    expect(src).toMatch(/\[book\?\.status, load, pollTimedOut\]/);
    // No inline magic 5*60*1000 budget that could drift from the module.
    expect(src).not.toMatch(/POLL_BUDGET_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });

  it("the terminal timeout state is rendered, never an infinite spinner", () => {
    expect(src).toMatch(/pollTimedOut && generating/);
    expect(src).toMatch(/taking longer than expected/i);
  });
});
