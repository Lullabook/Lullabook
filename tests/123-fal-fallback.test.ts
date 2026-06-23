import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import { RealFalAdapter } from "@/adapters/fal";
import { selectFalAdapter } from "@/lib/dev-bypass";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";

/**
 * Issue 123 — DEV_FAL_FALLBACK placeholder images (populated demo without live keys).
 *
 * Root cause carried from 122: `context.ts` gated the fallback on
 * `!optionalEnv("FAL_API_KEY")`, so the dev `.env.local` (which sets a key)
 * always selected `RealFalAdapter` → 100% illustration failure. The fix: the
 * fallback is **flag-only** (`DEV_FAL_FALLBACK` + non-prod), exactly like
 * `DEV_FORCE_SUBSCRIPTION` — a present key does NOT defeat the explicit flag.
 */

describe("123 — DEV_FAL_FALLBACK (flag-only, inert in production)", () => {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    DEV_FAL_FALLBACK: process.env.DEV_FAL_FALLBACK,
    FAL_API_KEY: process.env.FAL_API_KEY,
  };

  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    // Simulate the dev .env.local: a real key IS set.
    process.env.FAL_API_KEY = "a-real-key-is-set-in-dev";
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = prev.NODE_ENV ?? "test";
    if (prev.DEV_FAL_FALLBACK !== undefined) process.env.DEV_FAL_FALLBACK = prev.DEV_FAL_FALLBACK;
    else delete process.env.DEV_FAL_FALLBACK;
    if (prev.FAL_API_KEY !== undefined) process.env.FAL_API_KEY = prev.FAL_API_KEY;
    else delete process.env.FAL_API_KEY;
  });

  it("selects the fallback when DEV_FAL_FALLBACK=true EVEN IF FAL_API_KEY is set", () => {
    process.env.DEV_FAL_FALLBACK = "true";
    expect(selectFalAdapter()).toBeInstanceOf(DevFalFallbackAdapter);
  });

  it("selects the real adapter when the flag is off (key present)", () => {
    delete process.env.DEV_FAL_FALLBACK;
    expect(selectFalAdapter()).toBeInstanceOf(RealFalAdapter);
  });

  it("is inert in production even with the flag on", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.DEV_FAL_FALLBACK = "true";
    expect(selectFalAdapter()).toBeInstanceOf(RealFalAdapter);
  });

  it("DevFalFallbackAdapter through the pipeline yields an illustrated draft", async () => {
    process.env.DEV_FAL_FALLBACK = "true";
    const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-123", "dev@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    // Persona reaches `ready` with a placeholder LoRA + roster avatar (no live fal).
    expect(persona.status).toBe("ready");
    expect(persona.avatarKey).not.toBeNull();

    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "dev fallback illustrated",
    });

    // Illustrated draft — every page carries a stored illustration blob, not a
    // text-only-degraded draft.
    expect(book.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((p) => p.generationStatus === "ready")).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);
  });
});
