import type { DataStore } from "@/db/store";
import type { Tier } from "@/domain/types";
import { EntitlementService } from "@/services/entitlement";

/**
 * Story-cap & member-cap enforcement (issue 93 / ADR-0023).
 *
 * Enforces the monthly Story cap (4/8/20 per tier) and the Family-member cap
 * (2/4/∞) **server-side and idempotently**. A cap hit returns a structured
 * `StoryCapError` (403) with the count, cap, reset date, and upgrade CTA —
 * never a 500, never a dead end.
 *
 * **Idempotency:** the cap counter counts *distinct* Storybooks (by id) in the
 * current period. A replayed/duplicate generation request carries the same
 * `storybookId` and does not consume a second slot. The `requireUnderCap` gate
 * is a pure read — calling it twice cannot bump the count.
 *
 * **Failed generations don't count:** only `generating` / `draft` / `finalized`
 * books count toward the cap; a `failed` book is not counted (the slot is
 * effectively refunded by not being consumed).
 *
 * Member-cap is delegated to `EntitlementService.requireMemberSlot` (issue 91)
 * and wired into `PersonaService.createAdult` here.
 */

/** 403 raised when a Household is at its Story cap. */
export class StoryCapError extends Error {
  readonly status = 403;
  readonly code = "story_cap_reached";
  readonly count: number;
  readonly cap: number;
  readonly resetDate: string;
  readonly upgradeCta: string;

  constructor(count: number, cap: number, resetDate: string) {
    super(`Story cap reached (${count}/${cap} this month). Resets on ${resetDate}.`);
    this.name = "StoryCapError";
    this.count = count;
    this.cap = cap;
    this.resetDate = resetDate;
    this.upgradeCta = "Upgrade your tier for more stories per month.";
  }
}

/** Structured usage info for UI surfaces (issue 99). */
export interface StoryCapUsage {
  count: number;
  cap: number;
  resetDate: string;
  remaining: number;
}

/** Per-Household monthly period key (YYYY-MM). */
function periodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The first day of next month as an ISO date string. */
function nextResetDate(date = new Date()): string {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

export class StoryCapService {
  constructor(
    private readonly store: DataStore,
    private readonly entitlements: EntitlementService
  ) {}

  /** The Household's current monthly Story usage, including in-flight reservations. */
  getUsage(familyId: string, actorMemberId: string): StoryCapUsage {
    const ent = this.entitlements.getPlanEntitlement(familyId);
    const cap = ent.storyCap;
    const count = this.countStoriesThisMonth(familyId, actorMemberId);
    return {
      count,
      cap,
      resetDate: nextResetDate(),
      remaining: Math.max(0, cap - count),
    };
  }

  /** Reserve one shared Story allowance before the durable generation enqueue. */
  reserve(familyId: string, actorMemberId: string, storybookId: string): void {
    if (this.store.storyAllowanceReservations.has(storybookId)) return;
    const usage = this.getUsage(familyId, actorMemberId);
    if (usage.count >= usage.cap) {
      throw new StoryCapError(usage.count, usage.cap, usage.resetDate);
    }
    this.store.storyAllowanceReservations.set(storybookId, {
      storybookId,
      familyId,
      status: "reserved",
      createdAt: new Date(),
    });
  }

  /** Commit only after the text provider returns a valid Story. */
  commit(storybookId: string): void {
    const reservation = this.store.storyAllowanceReservations.get(storybookId);
    if (reservation?.status === "reserved") {
      reservation.status = "committed";
      this.store.storyAllowanceReservations.set(storybookId, reservation);
    }
  }

  /** Release a still-reserved allowance after text generation fails. */
  release(storybookId: string): void {
    const reservation = this.store.storyAllowanceReservations.get(storybookId);
    if (reservation?.status === "reserved") {
      // Refunds are state transitions, not deletes: finance/support must be
      // able to audit why an allowance became available again.
      reservation.status = "released";
      reservation.releasedAt = new Date();
      reservation.releaseReason = "story_text_generation_failed";
      this.store.storyAllowanceReservations.set(storybookId, reservation);
    }
  }

  getReservation(storybookId: string) {
    const reservation = this.store.storyAllowanceReservations.get(storybookId);
    // Preserve the existing generation seam: released reservations are no
    // longer active reservations. The append-only audit remains available via
    // getReservationAudit (and the server-side ledger map).
    return reservation?.status === "released" ? undefined : reservation;
  }

  getReservationAudit(storybookId: string) {
    return this.store.storyAllowanceReservations.get(storybookId);
  }

  /** Gate: throw StoryCapError if the Household is at or over its cap. */
  requireUnderCap(familyId: string, actorMemberId: string): void {
    const usage = this.getUsage(familyId, actorMemberId);
    if (usage.count >= usage.cap) {
      throw new StoryCapError(usage.count, usage.cap, usage.resetDate);
    }
  }

  /**
   * Record that a generation was initiated (idempotent by storybookId).
   * Replays with the same storybookId do not double-count.
   */
  recordGeneration(familyId: string, actorMemberId: string, storybookId: string): void {
    // Idempotency: the storybook is already in the store and counted by
    // countStoriesThisMonth — recording is a no-op. The count comes from
    // the store itself, not a separate counter, so replays can't inflate it.
    // This method exists as the explicit seam for the generate path.
    void familyId;
    void actorMemberId;
    void storybookId;
  }

  /** Count committed/reserved ledger entries plus legacy books without a ledger row. */
  private countStoriesThisMonth(familyId: string, actorMemberId: string): number {
    const period = periodKey();
    const ledgerIds = new Set(
      [...this.store.storyAllowanceReservations.values()]
        .filter(
          (r) =>
            r.familyId === familyId &&
            (r.status === "reserved" || r.status === "committed") &&
            r.createdAt.toISOString().slice(0, 7) === period
        )
        // A Storybook that reached `failed` never produced usable Story text
        // (glossary: `failed` = no Story text or too few Pages) — its
        // allowance is released whether or not the release seam ran, and
        // whether the ledger row was still `reserved` or already `committed`.
        // A `draft` with failed Pages is NOT refunded: holes are re-rollable.
        .filter((r) => this.store.storybooks.get(r.storybookId)?.status !== "failed")
        .map((r) => r.storybookId)
    );
    const legacyBooks = [...this.store.storybooks.values()].filter(
      (s) =>
        s.familyId === familyId &&
        s.status !== "failed" &&
        !ledgerIds.has(s.id) &&
        s.createdAt.toISOString().slice(0, 7) === period
    );
    return new Set([...ledgerIds, ...legacyBooks.map((s) => s.id)]).size;
  }

  /** Test-only: reset the current period's count by clearing storybooks and ledger rows. */
  resetForTesting(familyId: string, actorMemberId: string): void {
    const period = periodKey();
    for (const [id, s] of this.store.storybooks) {
      if (s.familyId === familyId && s.createdAt.toISOString().slice(0, 7) === period) {
        this.store.storybooks.delete(id);
      }
    }
    for (const [id, reservation] of this.store.storyAllowanceReservations) {
      if (
        reservation.familyId === familyId &&
        reservation.createdAt.toISOString().slice(0, 7) === period
      ) {
        this.store.storyAllowanceReservations.delete(id);
      }
    }
  }
}
