/**
 * Storybook generation must survive a dangling `selectedBabyId`.
 *
 * Live-audit finding (2026-07-31): a Member row carried
 * `selected_baby_id = <uuid>` while the `babies` table held no such row.
 * `normalizeBrief` copies `member.selectedBabyId` onto the Brief unchecked
 * (`storybook.ts`), so every generation reached `sync()` and died on
 * PostgreSQL's `storybooks_baby_id_fkey`:
 *
 *   insert or update on table "storybooks" violates foreign key constraint
 *   "storybooks_baby_id_fkey"
 *
 * Reproduced against the running dev server: `POST /api/storybooks` failed
 * for EVERY Brief, and no UI action could clear the stale pointer — the
 * Household was permanently unable to make a Storybook.
 *
 * The dangling pointer itself comes from `SupabaseDataStore.sync()` upserting
 * each table independently (the non-transactional-persistence gap recorded in
 * CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md, ticket 178): a run
 * that persisted `members` but not `babies` leaves exactly this state. Fixing
 * the transaction boundary is a separate, larger change. This gate pins the
 * cheap half — a stale pointer must degrade to "no Baby", never to a
 * permanently broken Household.
 */

import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/fixtures";

describe("Storybook — dangling selectedBabyId", () => {
  it("drops a selectedBabyId that no longer resolves to a Baby", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-dangling", "g@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-1", "sub-1");

    // The corrupt state: a pointer to a Baby that was never persisted.
    guardian.selectedBabyId = "baby-that-does-not-exist";
    ctx.store.members.set(guardian.id, guardian);
    expect(ctx.store.babies.size).toBe(0);

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [],
      storyType: "bedtime",
      theme: "sharing",
    });

    // Degrades to "no Baby" — the FK is never handed an unknown id.
    expect(book.babyId).toBeUndefined();
  });

  it("keeps a selectedBabyId that does resolve", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-ok", "g2@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus-2", "sub-2");

    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    guardian.selectedBabyId = baby.id;
    ctx.store.members.set(guardian.id, guardian);

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [],
      storyType: "bedtime",
      theme: "sharing",
    });

    expect(book.babyId).toBe(baby.id);
  });
});
