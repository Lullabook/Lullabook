import type { DataStore } from "@/db/store";
import { estimateProviderCostUsd } from "@/lib/provider-prices";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";

/**
 * Issue 204 — a hard, fail-closed ceiling on live fal.ai spend (default $20).
 *
 * Before a payable fal.ai attempt can reach the provider it is priced on the
 * exact route from `PROVIDER_PRICE_TABLE` (an unknown route throws — never
 * treated as zero), it must opt in via `LIVE_PROVIDER_RUN_APPROVED=true`, and
 * its estimated cost is held as a durable `reserved` cost-ledger row keyed by
 * the attempt's idempotency key. The caller flushes that hold to storage
 * BEFORE the provider call, so a crash mid-flight cannot silently spend past
 * the cap; `settle()` then transitions the hold to `succeeded` (keep it) or
 * `failed`/`cancelled` (release it). Crossing the ceiling throws
 * {@link LiveFalSpendCapBlockedError} and reserves nothing; crossing the
 * warning threshold emits a `spend_checkpoint` naming the remaining budget.
 *
 * The cap and warning thresholds are configuration (defaults $20 / $18), so
 * only a deliberate config change raises the budget.
 */
export interface LiveFalSpendCapConfig {
  /** Hard ceiling on cumulative live fal.ai spend. Default 20. */
  capUsd?: number;
  /** Cumulative spend at which a spend_checkpoint is emitted. Default 18. */
  warningAtUsd?: number;
  /**
   * `LIVE_PROVIDER_RUN_APPROVED` opt-in; only the exact value "true" unlocks
   * the boundary. When omitted, the production default is read from
   * `process.env.LIVE_PROVIDER_RUN_APPROVED`, so an operator grant unlocks
   * the live path without a code change.
   */
  liveRunApproved?: string;
}

export interface LiveFalSpendAttemptInput {
  familyId: string;
  personaId?: string;
  provider: string;
  endpoint: string;
  model: string;
  units: Record<string, number>;
  /** Idempotency key — the durable reservation's ledger key and settle handle. */
  idempotencyKey: string;
}

export interface LiveFalSpendCheckpoint {
  event: "spend_checkpoint";
  familyId: string;
  provider: string;
  endpoint: string;
  model: string;
  pricingVersion: string;
  estimatedCostUsd: number;
  cumulativeReservedUsd: number;
  capUsd: number;
  remainingBudgetUsd: number;
}

export class LiveFalSpendCapBlockedError extends Error {
  readonly status = 503;
  readonly code = "live_fal_spend_cap";
  constructor(message: string) {
    super(message);
    this.name = "LiveFalSpendCapBlockedError";
  }
}

const DEFAULT_CAP_USD = 20;
const DEFAULT_WARNING_AT_USD = 18;

/** Default observability sink: a structured stderr line, safe to log verbatim. */
function defaultCheckpointSink(checkpoint: LiveFalSpendCheckpoint): void {
  console.error(`[spend_checkpoint] ${JSON.stringify(checkpoint)}`);
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export class LiveFalSpendCapService {
  private readonly emitted: LiveFalSpendCheckpoint[] = [];

  constructor(
    private readonly store: DataStore,
    private readonly config: LiveFalSpendCapConfig = {},
    private readonly onCheckpoint: (checkpoint: LiveFalSpendCheckpoint) => void = defaultCheckpointSink,
    private readonly costMeter: ProviderCostMeteringService = new ProviderCostMeteringService(store),
  ) {}

  capUsd(): number {
    return this.config.capUsd ?? envNumber("FAL_LIVE_SPEND_CAP_USD", DEFAULT_CAP_USD);
  }

  private warningAtUsd(): number {
    return this.config.warningAtUsd ?? envNumber("FAL_LIVE_SPEND_WARN_AT_USD", DEFAULT_WARNING_AT_USD);
  }

  private liveRunApproved(): boolean {
    const optIn = this.config.liveRunApproved ?? process.env.LIVE_PROVIDER_RUN_APPROVED;
    return optIn === "true";
  }

  /** Live fal.ai holds: rows that are neither failed nor cancelled count against the ceiling. */
  private cumulativeReserved(familyId: string): number {
    return [...this.store.providerCostLedgerEntries.values()]
      .filter(
        (entry) =>
          entry.owningEntityIds.familyId === familyId &&
          entry.provider === "fal.ai" &&
          entry.outcome !== "failed" &&
          entry.outcome !== "cancelled",
      )
      .reduce((sum, entry) => sum + (entry.actualCostUsd ?? entry.estimatedCostUsd), 0);
  }

  /**
   * Reserve a payable live fal.ai attempt BEFORE the provider boundary. Returns
   * the versioned price-table estimate after persisting a `reserved` cost-ledger
   * row keyed by the idempotency key — or throws without spending a cent when
   * live run is not approved, the route is unknown, or the attempt would push
   * cumulative spend over the ceiling. A replay of the same idempotency key
   * returns the existing hold (idempotent, one row).
   */
  reserve(input: LiveFalSpendAttemptInput): { estimatedCostUsd: number; pricingVersion: string } {
    if (!this.liveRunApproved()) {
      throw new LiveFalSpendCapBlockedError(
        "Live fal.ai spend requires LIVE_PROVIDER_RUN_APPROVED=true",
      );
    }
    const price = estimateProviderCostUsd({
      provider: input.provider,
      endpoint: input.endpoint,
      model: input.model,
      units: input.units,
    });
    const reserved = this.cumulativeReserved(input.familyId);
    const after = reserved + price.estimatedCostUsd;
    if (after > this.capUsd()) {
      throw new LiveFalSpendCapBlockedError(
        `Live fal.ai spend cap exceeded: ${after.toFixed(2)} USD would exceed the $${this.capUsd()} cap`,
      );
    }
    this.costMeter.recordAttempt({
      provider: input.provider,
      endpoint: input.endpoint,
      model: input.model,
      pricingVersion: price.pricingVersion,
      units: input.units,
      estimatedCostUsd: price.estimatedCostUsd,
      latencyMs: 0,
      requestId: input.idempotencyKey,
      owningEntityIds: {
        familyId: input.familyId,
        ...(input.personaId ? { personaId: input.personaId } : {}),
      },
      attemptType: "training",
      outcome: "reserved",
    });
    if (after >= this.warningAtUsd()) {
      const checkpoint: LiveFalSpendCheckpoint = {
        event: "spend_checkpoint",
        familyId: input.familyId,
        provider: input.provider,
        endpoint: input.endpoint,
        model: input.model,
        pricingVersion: price.pricingVersion,
        estimatedCostUsd: price.estimatedCostUsd,
        cumulativeReservedUsd: after,
        capUsd: this.capUsd(),
        remainingBudgetUsd: this.capUsd() - after,
      };
      this.emitted.push(checkpoint);
      this.onCheckpoint(checkpoint);
    }
    return { estimatedCostUsd: price.estimatedCostUsd, pricingVersion: price.pricingVersion };
  }

  /**
   * Settle the durable hold for an attempt that reached the provider boundary:
   * `succeeded` keeps the hold (with the provider's job id); `failed`/`cancelled`
   * release it so failures cannot exhaust the ceiling.
   */
  settle(input: {
    familyId: string;
    idempotencyKey: string;
    outcome: "succeeded" | "failed" | "cancelled";
    providerRequestId?: string;
    latencyMs?: number;
  }): void {
    this.costMeter.settleAttempt({
      familyId: input.familyId,
      requestId: input.idempotencyKey,
      outcome: input.outcome,
      providerRequestId: input.providerRequestId,
      latencyMs: input.latencyMs,
    });
  }

  /** Test/observability readback of emitted checkpoints. */
  checkpoints(): LiveFalSpendCheckpoint[] {
    return [...this.emitted];
  }

  /** Test/observability readback of non-failed live fal.ai holds in the ledger. */
  reservations(): number[] {
    return [...this.store.providerCostLedgerEntries.values()]
      .filter((entry) => entry.provider === "fal.ai" && entry.outcome !== "failed")
      .map((entry) => entry.actualCostUsd ?? entry.estimatedCostUsd);
  }
}
