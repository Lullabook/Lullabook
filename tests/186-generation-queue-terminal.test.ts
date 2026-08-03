import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowJobPayload } from "@/adapters/types";
import { FakeWorkflow } from "@/adapters/fakes";
import { StorybookService } from "@/services/storybook";
import {
  createTestContext,
  goodPhoto,
  householdWithBaby,
  withActiveSubscription,
} from "@/test/fixtures";
import type { Storybook } from "@/domain/types";

/**
 * Issue 186 — the production Storybook enqueue boundary is durable and
 * non-blocking: `generating` + the allowance reservation persist BEFORE the
 * durable dispatch, the request performs zero provider work, duplicate
 * delivery is idempotent per idempotency key, every run reaches `draft` or
 * `failed` (never stranded `generating`), and a text/watchdog failure
 * releases the reservation exactly once.
 *
 * Route-level tests use the repo's established mock-context harness (tests
 * 77 / 171); service-level tests use createTestContext with the in-memory
 * store and fake adapters (tests 15 / 16 / 100).
 */

/** Records the durable payload but never runs the job inline (production shape). */
class CapturingWorkflow extends FakeWorkflow {
  jobs: Array<() => Promise<void>> = [];

  override enqueue(
    _name: string,
    work: () => Promise<void>,
    payload?: WorkflowJobPayload
  ): void {
    if (payload) this.enqueuedPayloads.push(payload);
    this.jobs.push(work);
  }

  /** The request boundary does not run provider work; the worker does. */
  override async flush(): Promise<void> {
    /* buffered; dispatched by the durable worker, never inline */
  }

  async runJobs(): Promise<void> {
    for (const job of [...this.jobs]) await job();
  }
}

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "guardian-186",
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => harness.ctx!,
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async () => ({
      sub: harness.authSub,
      email: `${harness.authSub}@example.com`,
      jurisdiction: "US",
    }),
  }),
}));

import { GET, POST } from "@/app/api/storybooks/route";

function bearerRequest(
  path: string,
  init: RequestInit & { token?: string } = {}
): Request {
  const { token = "good", ...rest } = init;
  return new Request(`http://localhost${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(rest.headers ?? {}),
    },
  });
}

async function readyPersona(ctx: ReturnType<typeof createTestContext>) {
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-186", "queue@example.com");
  withActiveSubscription(ctx, member);
  const persona = await ctx.personas.createAdult({
    memberId: member.id,
    displayName: "Star",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  return { member, persona };
}

describe("186 — generation queue is durable, non-blocking, terminal", () => {
  it("POST /api/storybooks returns a persisted `generating` Storybook with zero provider work in the request", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx, "Maya");
    harness.authSub = guardian.authUserId;
    harness.ctx = ctx;
    // Production shape: persist() must not drain the queue inline — the
    // worker (Inngest / captured job) does the provider work later.
    ctx.workflow.flush = async () => {};

    const res = await POST(
      bearerRequest("/api/storybooks", {
        method: "POST",
        body: JSON.stringify({
          starringPersonaIds: [babyPersona.id],
          babyId: ctx.store.babies.values().next().value?.id,
          storyType: "bedtime",
          theme: "A fast night",
        }),
      })
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as { storybookId: string; status: string };
    // The book is persisted as `generating` immediately — the reader can poll
    // it — and NO provider has been touched by the request.
    expect(created.status).toBe("generating");
    expect(ctx.store.getStorybook(created.storybookId, guardian.id)?.status).toBe(
      "generating"
    );
    expect(ctx.anthropic.calls).toHaveLength(0);
    expect(ctx.fal.imageCalls).toBe(0);

    // The durable dispatch completes the run to a terminal state.
    await ctx.workflow.drain();
    expect(ctx.store.getStorybook(created.storybookId, guardian.id)?.status).toBe("draft");
  });

  it("enqueue boundary persists `generating` + reservation before dispatch and touches no provider", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    const capturing = new CapturingWorkflow();
    const storybooks = new StorybookService(
      ctx.store,
      ctx.anthropic,
      ctx.fal,
      ctx.childSafety,
      ctx.blobs,
      capturing,
      ctx.subscriptions,
      ctx.classicCatalog,
      false,
      null,
      null,
      ctx.pastStorySummary,
      ctx.entitlements
    );

    const book = await storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "async boundary",
    });

    // Durable state precedes dispatch: allowance reserved, book persisted
    // `generating`, and the queue holds exactly one serializable payload.
    expect(book.status).toBe("generating");
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("generating");
    expect(ctx.storyCap.getReservation(book.id)).toMatchObject({ status: "reserved" });
    expect(capturing.enqueuedPayloads).toEqual([
      { type: "storybook-generate", storybookId: book.id, memberId: member.id },
    ]);
    // Zero Anthropic / fal spend in the request path.
    expect(ctx.anthropic.calls).toHaveLength(0);
    expect(ctx.fal.imageCalls).toBe(0);

    await capturing.runJobs();
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("draft");
  });

  it("one job delivery creates at most one text attempt for its text idempotency key", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.workflow.simulateAtLeastOnceDelivery = true;

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "replayed once",
    });
    await ctx.workflow.drain();

    // At-least-once delivery re-runs the job body, but the `${book.id}/story`
    // memoized step executes the Anthropic text attempt exactly once.
    expect(ctx.anthropic.calls).toHaveLength(1);
    expect(ctx.workflow.enqueuedPayloads).toHaveLength(1);
    expect(ctx.workflow.steps.filter((s) => s === "claude-pass")).toHaveLength(1);
    expect(ctx.workflow.steps.filter((s) => s === "claude-pass:memoized")).toHaveLength(
      1
    );
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("draft");
  });

  it("each (Storybook, Page, attempt) idempotency key creates at most one Page attempt, including after replay", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    ctx.workflow.simulateAtLeastOnceDelivery = true;
    ctx.fal.failImageOnPage = 3;
    ctx.fal.currentPage = 0;

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "page replay",
    });
    await ctx.workflow.drain();

    // Exactly 12 Page rows, no duplicates, and exactly one fal spend per
    // (book, page, attempt=0) key.
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(12);
    expect(new Set(pages.map((p) => p.id)).size).toBe(12);
    expect(ctx.fal.imageCalls).toBe(12);
    const pageKeys = ctx.fal.idempotencyKeys.filter(
      (k) => k.startsWith(`${book.id}/`) && k.endsWith("/fal-generate")
    );
    expect(pageKeys).toHaveLength(12);
    expect(new Set(pageKeys).size).toBe(12);

    // Recovery: one repair job for (book, page, attempt=1) lands exactly one
    // recovery candidate even under replay.
    const failed = ctx.store.getPagesForStorybook(book.id).find((p) => p.index === 2)!;
    expect(failed.generationStatus).toBe("failed");

    ctx.fal.failImageOnPage = null;
    ctx.fal.currentPage = 0;
    ctx.storybooks.recoverPage(member.id, failed.id);
    await ctx.workflow.drain();

    const recovered = ctx.store.pages.get(failed.id)!;
    expect(recovered.generationStatus).toBe("ready");
    expect(
      ctx.store.getCandidatesForPage(failed.id).filter((c) => c.id === `${failed.id}-recover-1`)
    ).toHaveLength(1);
  });

  it("a provider terminal failure leaves `failed`, never stranded `generating`", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(
      new Error("Claude outage")
    );

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "provider down",
    });
    await expect(ctx.workflow.drain()).rejects.toThrow("Claude outage");

    const stored = ctx.store.getStorybook(book.id, member.id)!;
    expect(stored.status).toBe("failed");
    expect([...ctx.store.storybooks.values()].some((b) => b.status === "generating")).toBe(
      false
    );
  });

  it("a worker timeout (watchdog) reaps to `failed` with no text and `draft` with text; never stranded", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    const budgetMs = 5 * 60 * 1000;

    // Stranded with no text: watchdog forces `failed`.
    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "lost worker",
    });
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("generating");
    const past = new Date(book.createdAt.getTime() + budgetMs + 1);
    expect(ctx.storybooks.reapStrandedGenerations(past, budgetMs)).toBe(1);
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("failed");

    // Stranded but the text pass already persisted: watchdog degrades to a
    // text-viewable `draft`, never `failed`, never `generating`.
    const stranded: Storybook = {
      id: "stranded-with-text",
      familyId: member.familyId,
      createdByMemberId: member.id,
      status: "generating",
      brief: { starringPersonaIds: [], storyType: "bedtime", theme: "old worker" },
      styleBible: null,
      rerollBudgetRemaining: 5,
      rerollCredits: 0,
      createdAt: new Date(Date.now() - (budgetMs + 1000)),
      finalizedAt: null,
    };
    ctx.store.saveStorybook(stranded);
    ctx.store.savePersistedGeneration({
      storybookId: stranded.id,
      story: ctx.anthropic.response,
      persistedAt: new Date(),
    });
    expect(ctx.storybooks.reapStrandedGenerations(new Date(), budgetMs)).toBe(1);
    expect(ctx.store.storybooks.get(stranded.id)?.status).toBe("draft");
    expect([...ctx.store.storybooks.values()].some((b) => b.status === "generating")).toBe(
      false
    );
  });

  it("a text failure releases its Story reservation exactly once", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(
      new Error("Claude outage")
    );

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "refund text",
    });
    await expect(ctx.workflow.drain()).rejects.toThrow();

    const audit = ctx.storyCap.getReservationAudit(book.id)!;
    expect(audit.status).toBe("released");
    expect(audit.releasedAt).toBeDefined();
    expect(audit.releaseReason).toBe("story_text_generation_failed");
    // No longer an active reservation — the allowance is available again.
    expect(ctx.storyCap.getReservation(book.id)).toBeUndefined();

    // A second release is a no-op: the audit row records one transition only.
    ctx.storyCap.release(book.id);
    const after = ctx.storyCap.getReservationAudit(book.id)!;
    expect(after.status).toBe("released");
    expect(after.releasedAt!.getTime()).toBe(audit.releasedAt!.getTime());
  });

  it("a watchdog failure releases its Story reservation exactly once", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyPersona(ctx);
    const budgetMs = 5 * 60 * 1000;

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "watchdog refund",
    });
    const past = new Date(book.createdAt.getTime() + budgetMs + 1);
    expect(ctx.storybooks.reapStrandedGenerations(past, budgetMs)).toBe(1);

    const audit = ctx.storyCap.getReservationAudit(book.id)!;
    expect(audit.status).toBe("released");
    expect(audit.releasedAt).toBeDefined();

    // A second reap finds nothing stranded; the reservation is untouched.
    expect(ctx.storybooks.reapStrandedGenerations(past, budgetMs)).toBe(0);
    expect(ctx.storyCap.getReservationAudit(book.id)!.releasedAt!.getTime()).toBe(
      audit.releasedAt!.getTime()
    );
  });

  it("the backend owns provider credentials: no client request or response carries a provider key", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx, "Maya");
    harness.authSub = guardian.authUserId;
    harness.ctx = ctx;

    const brief = {
      starringPersonaIds: [babyPersona.id],
      storyType: "bedtime" as const,
      theme: "Keyless moon",
    };
    const res = await POST(
      bearerRequest("/api/storybooks", {
        method: "POST",
        body: JSON.stringify(brief),
      })
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as { storybookId: string };
    await ctx.workflow.drain();

    const responseJson = JSON.stringify({ brief, create: created, ...(await (await GET(bearerRequest("/api/storybooks"))).json()) });
    expect(responseJson).not.toMatch(/api[_-]?key|secret|anthropic|fal[_-]?api|SUPABASE_SERVICE_ROLE_KEY/i);

    // The route never reads provider credentials.
    const routeSrc = readFileSync(
      path.join(process.cwd(), "src/app/api/storybooks/route.ts"),
      "utf8"
    );
    expect(routeSrc).not.toMatch(/ANTHROPIC_API_KEY|FAL_API_KEY|SUPABASE_SERVICE_ROLE_KEY|process\.env\.(ANTHROPIC|FAL)/);
  });
});
