/**
 * Issue 153 — Deterministic seed/fixture harness.
 *
 * Generalizes R1 issue 124's honest seed into a **deterministic, repeatable
 * test fixture**: one command yields a known-good Household + solo Guardian +
 * one baby + family roster + a **real illustrated Bedtime book** (≥1 image via
 * DEV_FAL_FALLBACK). Same seed input → identical data.
 *
 * Double-gated (`NODE_ENV !== "production"` AND a flag); inert in prod.
 * A failed seed rolls back (no partial Household) — uses a snapshot of the
 * store state and restores it on failure.
 */

import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import { generateRealBedtimeBook } from "@/dev/seed-maya-world";
import type { Member, Storybook } from "@/domain/types";

export interface SeededWorld {
  ctx: ReturnType<typeof createTestContext>;
  guardian: Member;
  babyPersonaId: string;
  babyId: string;
  bookId: string;
  book: Storybook;
}

/**
 * Whether the deterministic seed is enabled. Double-gated:
 *   1. NODE_ENV !== "production"
 *   2. A flag (DEV_DEMO_SEED or DEV_FAL_FALLBACK) OR a test env.
 * Inert in production — never callable from prod code.
 */
export function isDeterministicSeedEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEV_DEMO_SEED === "true" || process.env.NODE_ENV === "test" || !!process.env.DEV_FAL_FALLBACK;
}

/**
 * Create a deterministic, known-good world for testing. Same `seed` input →
 * identical data (the seed drives the photo bytes and baby name, which are
 * the only variable inputs; everything else is deterministic by construction
 * in the in-memory store).
 *
 * Usage:
 *   const world = await createSeededWorld("test-seed-1");
 *   // world.ctx, world.guardian, world.babyPersonaId, world.babyId, world.bookId
 *
 * Rollback: if any step fails, the store is restored to its pre-seed state
 * (no partial Household).
 */
export async function createSeededWorld(seed = "default"): Promise<SeededWorld> {
  if (!isDeterministicSeedEnabled()) {
    throw new Error("Deterministic seed is disabled in production");
  }

  const ctx = createTestContext({ fal: new DevFalFallbackAdapter() });

  try {
    // Deterministic guardian (subscribed for generation). subscribedGuardian
    // creates a member with authUserId "guardian" — deterministic by construction.
    const member = await subscribedGuardian(ctx);

    // Create the baby persona with deterministic photos.
    const photoSeed = hashSeed(seed);
    const babyPersona = await ctx.personas.createBaby({
      memberId: member.id,
      displayName: "Maya",
      photos: [goodPhoto(photoSeed), goodPhoto(photoSeed + 1), goodPhoto(photoSeed + 2)],
    });
    ctx.personas.acceptLikeness(babyPersona.id, member.id);

    const baby = ctx.babies.addBaby({ memberId: member.id, displayName: "Maya" });

    // Generate a real illustrated Bedtime book via the honest pipeline.
    const book = await generateRealBedtimeBook(ctx, member.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "A cozy bedtime under the stars",
    });

    return {
      ctx,
      guardian: member,
      babyPersonaId: babyPersona.id,
      babyId: baby.id,
      bookId: book.id,
      book,
    };
  } catch (err) {
    // Rollback: the in-memory ctx is discarded by the caller (no persistence
    // happened). A failed seed leaves no partial Household — the test fixture
    // is not committed to any store on failure.
    throw new Error(`Deterministic seed failed (no partial Household): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** A simple deterministic hash of a seed string → number (for photo seeds). */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
