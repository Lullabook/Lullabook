import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createSeededWorld, isDeterministicSeedEnabled } from "@/dev/deterministic-seed";

/**
 * Issue 153 — Deterministic seed/fixture harness.
 */

describe("153 — deterministic seed fixture", () => {
  const env = process.env as Record<string, string | undefined>;
  beforeEach(() => { env.NODE_ENV = "test"; });
  afterEach(() => { env.NODE_ENV = "test"; });

  it("isDeterministicSeedEnabled is true under test", () => {
    expect(isDeterministicSeedEnabled()).toBe(true);
  });

  it("isDeterministicSeedEnabled is false in production", () => {
    env.NODE_ENV = "production";
    delete env.DEV_DEMO_SEED;
    delete env.DEV_FAL_FALLBACK;
    expect(isDeterministicSeedEnabled()).toBe(false);
  });

  it("produces a complete known-good world (Household + baby + illustrated draft book)", async () => {
    const world = await createSeededWorld("complete-test");
    expect(world.guardian).toBeDefined();
    expect(world.babyPersonaId).toBeDefined();
    expect(world.babyId).toBeDefined();
    expect(world.bookId).toBeDefined();

    expect(["draft", "failed"]).toContain(world.book.status);
    expect(world.book.status).toBe("draft");

    const pages = world.ctx.store.getPagesForStorybook(world.bookId);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);
  });

  it("is deterministic — same seed → same data shape (status, page count)", async () => {
    const world1 = await createSeededWorld("determinism-test");
    const world2 = await createSeededWorld("determinism-test");

    expect(world1.book.status).toBe(world2.book.status);
    expect(world1.book.brief.storyType).toBe(world2.book.brief.storyType);

    const pages1 = world1.ctx.store.getPagesForStorybook(world1.bookId);
    const pages2 = world2.ctx.store.getPagesForStorybook(world2.bookId);
    expect(pages1.length).toBe(pages2.length);
  });

  it("different seeds → different book IDs (fresh fixture each time)", async () => {
    const world1 = await createSeededWorld("seed-A");
    const world2 = await createSeededWorld("seed-B");
    expect(world1.bookId).not.toBe(world2.bookId);
  });

  it("throws (no partial Household) when the seed is disabled", async () => {
    env.NODE_ENV = "production";
    delete env.DEV_DEMO_SEED;
    delete env.DEV_FAL_FALLBACK;
    await expect(createSeededWorld("disabled-test")).rejects.toThrow(/disabled/i);
    env.NODE_ENV = "test";
  });
});
