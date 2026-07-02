import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import { generateRealBedtimeBook } from "@/dev/seed-maya-world";
import { isR1AudioEnabled } from "@/lib/r1-config";

/**
 * Issue 145 — Cut audio from R1.
 *
 * Acceptance: voice endpoints are inert (clean 404, never 500) when audio is
 * cut; the storybook generation loop reaches a terminal state with audio absent.
 * The cut is a server-side gate before auth — a cut endpoint never runs.
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

describe("145 — audio cut: voice endpoints are inert (404, never 500)", () => {
  beforeEach(() => {
    delete process.env.R1_AUDIO_ENABLED;
  });
  afterEach(() => {
    delete process.env.R1_AUDIO_ENABLED;
  });

  it("isR1AudioEnabled() is false by default (audio cut in R1)", () => {
    expect(isR1AudioEnabled()).toBe(false);
  });

  it("POST /api/voice/clip returns 404 before auth when audio is cut", async () => {
    const { POST } = await import("@/app/api/voice/clip/route");
    const res = await POST(new Request("https://x/api/voice/clip", { method: "POST" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not available/i);
  });

  it("GET /api/voice/list returns 404 before auth when audio is cut", async () => {
    const { GET } = await import("@/app/api/voice/list/route");
    const res = await GET(new Request("https://x/api/voice/list?personaId=p1"));
    expect(res.status).toBe(404);
  });

  it("GET /api/voice/playback returns 404 before auth when audio is cut", async () => {
    const { GET } = await import("@/app/api/voice/playback/route");
    const res = await GET(new Request("https://x/api/voice/playback?clipId=c1"));
    expect(res.status).toBe(404);
  });

  it("POST /api/voice/revoke returns 404 before auth when audio is cut", async () => {
    const { POST } = await import("@/app/api/voice/revoke/route");
    const res = await POST(new Request("https://x/api/voice/revoke", { method: "POST" }));
    expect(res.status).toBe(404);
  });
});

describe("145 — audio cut: storybook loop unaffected (terminal state)", () => {
  beforeEach(() => {
    delete process.env.R1_AUDIO_ENABLED;
  });

  it("generates a draft book with audio absent (no spinner waiting on voice)", async () => {
    const { ctx, guardian, babyPersona, baby } = await setupBaby();
    const book = await generateRealBedtimeBook(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "A cozy bedtime under the stars",
    });
    // Terminal state — never stranded in "generating" waiting on a voice step.
    expect(["draft", "failed"]).toContain(book.status);
    expect(book.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
  });
});
