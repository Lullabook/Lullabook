import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFalAdapter } from "@/adapters/fal";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 122 — Diagnose & fix the fal.ai illustration failure.
 *
 * Root cause (audit: 48/48 page-image calls `failed`, zero images on disk):
 *  1. The dev `.env.local` sets `FAL_API_KEY`, so `context.ts` selected
 *     `RealFalAdapter` even in dev (the `DEV_FAL_FALLBACK` gate also required
 *     the key to be ABSENT — see issue 123). Real fal ran against LoRA keys
 *     synthesized by the faked training path (`lora/<jobId>`), which fal rejects.
 *  2. The `fal-gen` page step swallowed every thrown error into a generic
 *     `moderationKey = "failed"` marker, hiding the upstream status/body — so
 *     the 100% failure read as an opaque "no images" with no diagnosable cause.
 *
 * These tests pin (a) the real adapter's failure contracts at the fetch boundary
 * and (b) that the storybook step now RECORDS the upstream error message instead
 * of discarding it, while preserving the text-viewable `draft` fallback (102).
 */

type FetchCall = { url: string; init?: RequestInit };

function fetchSequence(responses: (object | Buffer)[]): { calls: FetchCall[]; fetch: typeof fetch } {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = responses.shift();
    if (body === undefined) throw new Error("Unexpected extra fetch call");
    if (Buffer.isBuffer(body)) {
      return new Response(new Uint8Array(body), { status: 200 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}

beforeEach(() => {
  vi.stubEnv("FAL_API_KEY", "fal-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("122 — RealFalAdapter failure contracts at the HTTP boundary", () => {
  it("surfaces the upstream status when fal rejects the submit (4xx)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("lora path not found", { status: 422 }))
    );

    await expect(
      new RealFalAdapter().generateImage("a cozy scene", "lora/bogus", {
        idempotencyKey: "book-1/0/1",
      })
    ).rejects.toThrow(/422/);
  });

  it("throws when the poll status is FAILED (re-rollable hole, not a hang)", async () => {
    const { fetch } = fetchSequence([
      { request_id: "req-1", status_url: "https://q/status", response_url: "https://q/result" },
      { status: "FAILED" },
    ]);
    vi.stubGlobal("fetch", fetch);

    await expect(
      new RealFalAdapter().generateImage("a cozy scene", "lora/abc")
    ).rejects.toThrow(/fal.ai inference failed/);
  });

  it("throws when a COMPLETED result carries no image url", async () => {
    const { fetch } = fetchSequence([
      { request_id: "req-1", status_url: "https://q/status", response_url: "https://q/result" },
      { status: "COMPLETED" },
      {},
    ]);
    vi.stubGlobal("fetch", fetch);

    await expect(
      new RealFalAdapter().generateImage("a cozy scene", "lora/abc")
    ).rejects.toThrow(/no image/);
  });

  it("throws a timeout within the 5-min watchdog when the poll never completes", async () => {
    vi.useFakeTimers();
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        // First call = queue submit; every later call = an unfinished poll.
        if (call === 1) {
          return new Response(
            JSON.stringify({
              request_id: "req-1",
              status_url: "https://q/status",
              response_url: "https://q/result",
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ status: "IN_QUEUE" }), { status: 200 });
      })
    );

    const pending = new RealFalAdapter().generateImage("a cozy scene", "lora/abc");
    // Attach the handler BEFORE advancing timers so the rejection is never
    // flagged as unhandled while the fake clock drives the poll loop.
    const settled = pending.then(
      () => new Error("expected rejection but resolved"),
      (e: unknown) => e as Error
    );
    // Advance past the 5-minute poll deadline (POLL_TIMEOUT_MS = 5 * 60 * 1000).
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

    const err = await settled;
    expect(err.message).toMatch(/timed out/);
  });
});

describe("122 — storybook surfaces the upstream fal error (not a generic 'failed')", () => {
  async function readyMember(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-122", "fal@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("records the fal error message on the page and still reaches a text-viewable draft", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    // Make every image generation throw a realistic upstream error message —
    // the kind RealFalAdapter produces — and assert it is preserved end-to-end
    // rather than collapsed to an opaque "failed".
    ctx.fal.failPages = new Set(Array.from({ length: 12 }, (_, i) => i + 1));
    ctx.fal.failImageMessage = "fal.ai request failed (422): lora path not found";

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "surface the upstream error",
    });

    // Text-viewable fallback preserved.
    expect(book.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.every((p) => p.generationStatus === "failed")).toBe(true);

    // The upstream error message is recorded for diagnosis (page-0, attempt 0).
    const errorBlob = await ctx.blobs.get(
      `books/${book.familyId}/${book.id}/page-0.png.attempt-0.error`
    );
    expect(errorBlob?.toString()).toContain("422");
    expect(errorBlob?.toString()).toContain("lora path not found");
  });
});
