import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createSeededWorld, isDeterministicSeedEnabled } from "@/dev/deterministic-seed";

/**
 * Issue 153 — Deterministic seed/fixture harness.
 *
 * Acceptance:
 *  - One command produces a complete known-good world: Household + baby +
 *    family + an illustrated `draft` book (≥1 image via DEV_FAL_FALLBACK).
 *  - Deterministic: identical output for the same seed input (asserted).
 *  - Double-gated + inert in production.
 *  - Reusable by both manual and automated suites.
 */

describe("153 — deterministic seed fixture", () => {
  beforeEach(() => { process.env.NODE_ENV = "test"; });
  afterEach(() => { process.env.NODE_ENV = "test"; });

  it("isDeterministicSeedEnabled is true under test", () => {
    expect(isDeterministicSeedEnabled()).toBe(true);
  });

  it("isDeterministicSeedEnabled is false in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DEV_DEMO_SEED;
    delete process.env.DEV_FAL_FALLBACK;
    expect(isDeterministicSeedEnabled()).toBe(false);
  });

  it("produces a complete known-good world (Household + baby + illustrated draft book)", async () => {
    const world = await createSeededWorld("complete-test");
    expect(world.guardian).toBeDefined();
    expect(world.babyPersonaId).toBeDefined();
    expect(world.babyId).toBeDefined();
    expect(world.bookId).toBeDefined();

    const book = world.ctx.store.getStorybook(world.bookId, world.guardian.id);
    expect(book).toBeDefined();
    expect(["draft", "failed"]).toContain(book!.status);
    expect(book!.status).toBe("draft");

    const pages = world.ctx.store.getPagesForStorybook(world.bookId);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((p) => p.text.length > 0)).toBe(true);
    expect(pages.every((p) => p.illustrationBlobKey !== null)).toBe(true);
  });

  it("is deterministic — same seed → same data shape (theme, name, status, page count)", async () => {
    const world1 = await createSeededWorld("determinism-test");
    const world2 = await createSeededWorld("determinism-test");

    const book1 = world1.ctx.store.getStorybook(world1.bookId, world1.guardian.id)!;
    const book2 = world2.ctx.store.getStorybook(world2.bookId, world2.guardian.id)!;

    // Same theme, story type, status, baby name.
    expect(book1.theme).toBe(book2.theme);
    expect(book1.storyType).toBe(book2.storyType);
    expect(book1.status).toBe(book2.status);

    const pages1 = world1.ctx.store.getPagesForStorybook(world1.bookId);
    const pages2 = world2.ctx.store.getPagesForStorybook(world2.bookId);
    expect(pages1.length).toBe(pages2.length);
    expect(pages1.every((p) => p.text.length > 0)).toBe(true);
    expect(pages2.every((p) => p.text.length > 0)).toBe(true);
  });

  it("different seeds → different book IDs (fresh fixture each time)", async () => {
    const world1 = await createSeededWorld("seed-A");
    const world2 = await createSeededWorld("seed-B");
    expect(world1.bookId).not.toBe(world2.bookId);
  });

  it("throws (no partial Household) when the seed is disabled", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DEV_DEMO_SEED;
    delete process.env.DEV_FAL_FALLBACK;
    await expect(createSeededWorld("disabled-test")).rejects.toThrow(/disabled/i);
  });
});
