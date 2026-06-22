import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Tier } from "@/domain/types";
import { EntitlementService } from "@/services/entitlement";

/**
 * Credit ledger + metering (issue 94 / ADR-0023).
 *
 * A per-Household ledger that meters the cost-heavy features beyond their
 * included allotment: **video pages** (Plus: 2 included/mo), **custom-style
 * trainings** (Plus: 1 included/mo), and **re-roll overage** (ADR-0004).
 *
 * **Balance is server-authoritative.** Every metered action debits
 * atomically; included allotments apply before purchased credits. A failed
 * video render or style train **credits back** the debit (refund-on-failure);
 * a replayed debit (same idempotency key) does not double-charge. Exhaustion
 * returns a structured `CreditError` (403) — never a silent failure, never a
 * charge for a failed generation.
 */

/** Actions that consume credits. */
export type MeteredAction = "video" | "customStyle" | "reroll";

/** Per-tier included monthly allotments (ADR-0023). */
const INCLUDED_PER_TIER: Record<Tier, Record<MeteredAction, number>> = {
  basic: { video: 0, customStyle: 0, reroll: 0 },
  normal: { video: 0, customStyle: 0, reroll: 0 },
  plus: { video: 2, customStyle: 1, reroll: 0 },
};

/** 403 raised when a Household is out of credits. */
export class CreditError extends Error {
  readonly status = 403;
  readonly code = "out_of_credits";
  readonly balance: CreditBalance;
  readonly resetDate: string;
  readonly buyCta: string;

  constructor(balance: CreditBalance) {
    super(`Out of credits. Resets on ${balance.resetDate}.`);
    this.name = "CreditError";
    this.balance = balance;
    this.resetDate = balance.resetDate;
    this.buyCta = "Buy more credits or upgrade your tier.";
  }
}

/** Read-only balance view for UI surfaces (issue 99). */
export interface CreditBalance {
  videoIncluded: number;
  videoUsed: number;
  customStyleIncluded: number;
  customStyleUsed: number;
  rerollIncluded: number;
  rerollUsed: number;
  purchased: number;
  resetDate: string;
}

/** Per-Household ledger entry. */
interface LedgerEntry {
  id: string;
  familyId: string;
  action: MeteredAction;
  idempotencyKey: string;
  type: "debit" | "refund" | "purchase";
  amount: number;
  createdAt: Date;
}

function periodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function nextResetDate(date = new Date()): string {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

export class CreditLedgerService {
  private ledger = new Map<string, LedgerEntry[]>();
  private purchasedCredits = new Map<string, number>();

  constructor(
    private readonly store: DataStore,
    private readonly entitlements: EntitlementService
  ) {}

  /** The Household's current credit balance. */
  getBalance(familyId: string): CreditBalance {
    const tier = this.entitlements.getTier(familyId) as Tier;
    const included = INCLUDED_PER_TIER[tier] ?? { video: 0, customStyle: 0, reroll: 0 };
    const period = periodKey();
    const entries = (this.ledger.get(familyId) ?? []).filter(
      (e) => e.createdAt.toISOString().slice(0, 7) === period
    );

    const used = { video: 0, customStyle: 0, reroll: 0 };
    const debitedKeys = new Set<string>();
    for (const entry of entries) {
      const key = `${entry.action}:${entry.idempotencyKey}`;
      if (entry.type === "debit" && !debitedKeys.has(key)) {
        used[entry.action] += 1;
        debitedKeys.add(key);
      }
      if (entry.type === "refund" && debitedKeys.has(key)) {
        used[entry.action] -= 1;
        debitedKeys.delete(key);
      }
    }

    // Included credits absorb debits per-action first; overflow goes to purchased.
    const videoOverflow = Math.max(0, used.video - included.video);
    const customStyleOverflow = Math.max(0, used.customStyle - included.customStyle);
    const rerollOverflow = Math.max(0, used.reroll - included.reroll);
    const overflowIntoPurchased = videoOverflow + customStyleOverflow + rerollOverflow;
    const purchasedTotal = this.purchasedCredits.get(familyId) ?? 0;
    const purchasedRemaining = Math.max(0, purchasedTotal - overflowIntoPurchased);

    return {
      videoIncluded: Math.max(0, included.video - used.video),
      videoUsed: used.video,
      customStyleIncluded: Math.max(0, included.customStyle - used.customStyle),
      customStyleUsed: used.customStyle,
      rerollIncluded: Math.max(0, included.reroll - used.reroll),
      rerollUsed: used.reroll,
      purchased: purchasedRemaining,
      resetDate: nextResetDate(),
    };
  }

  /** Debit one credit for the given action. Idempotent by idempotencyKey. */
  debit(familyId: string, action: MeteredAction, idempotencyKey: string): void {
    // Idempotency: check if already debited
    const entries = this.ledger.get(familyId) ?? [];
    const key = `${action}:${idempotencyKey}`;
    const alreadyDebited = entries.some(
      (e) => e.type === "debit" && `${e.action}:${e.idempotencyKey}` === key
    );
    if (alreadyDebited) return; // replay — no double-charge

    // Check balance — included for this action + purchased pool
    const balance = this.getBalance(familyId);
    const includedAvailable = balance[`${action}Included` as keyof CreditBalance] as number;
    const totalAvailable = includedAvailable + balance.purchased;
    if (totalAvailable <= 0) {
      throw new CreditError(balance);
    }

    // Record debit
    const entry: LedgerEntry = {
      id: uuid(),
      familyId,
      action,
      idempotencyKey,
      type: "debit",
      amount: 1,
      createdAt: new Date(),
    };
    this.ledger.set(familyId, [...entries, entry]);
  }

  /** Refund a debit (failure path). Idempotent — double refund doesn't double-credit. */
  refund(familyId: string, action: MeteredAction, idempotencyKey: string): void {
    const entries = this.ledger.get(familyId) ?? [];
    const key = `${action}:${idempotencyKey}`;
    const alreadyRefunded = entries.some(
      (e) => e.type === "refund" && `${e.action}:${e.idempotencyKey}` === key
    );
    if (alreadyRefunded) return; // replay — no double-refund

    const entry: LedgerEntry = {
      id: uuid(),
      familyId,
      action,
      idempotencyKey,
      type: "refund",
      amount: 1,
      createdAt: new Date(),
    };
    this.ledger.set(familyId, [...entries, entry]);
  }

  /** Add purchased credits (server-side only, after IAP). */
  addPurchasedCredits(familyId: string, amount: number): void {
    const current = this.purchasedCredits.get(familyId) ?? 0;
    this.purchasedCredits.set(familyId, current + amount);
  }

  /** Test-only: reset the ledger for a family (simulates monthly reset). */
  resetForTesting(familyId: string): void {
    this.ledger.delete(familyId);
  }
}
