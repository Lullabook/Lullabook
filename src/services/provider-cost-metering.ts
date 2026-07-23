import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";

export type ProviderAttemptType =
  | "text"
  | "image"
  | "training"
  | "moderation"
  | "storage"
  | "queue"
  | "retry"
  | "repair";
export type ProviderAttemptOutcome =
  | "succeeded"
  | "failed"
  | "retried"
  | "cancelled"
  | "timed_out";

export interface OwningEntityIds {
  familyId: string;
  personaId?: string;
  storybookId?: string;
  pageId?: string;
}

/** The only provider data retained by the cost ledger. Sensitive payloads are deliberately absent. */
export interface ProviderCostLedgerEntry {
  id: string;
  provider: string;
  endpoint: string;
  model: string;
  pricingVersion: string;
  units: Record<string, number>;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  latencyMs: number;
  requestId: string;
  /** Provider-bakeoff naming alias; normalized to requestId at the seam. */
  providerRequestId: string;
  owningEntityIds: OwningEntityIds;
  attemptType: ProviderAttemptType;
  outcome: ProviderAttemptOutcome;
  costCategory: "provider_attempt" | "training_amortization";
  createdAt: Date;
}

export interface ProviderAttemptInput {
  provider: string;
  endpoint: string;
  model: string;
  pricingVersion: string;
  units: Record<string, number>;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  latencyMs: number;
  requestId?: string;
  providerRequestId?: string;
  owningEntityIds: OwningEntityIds;
  attemptType: ProviderAttemptType;
  outcome: ProviderAttemptOutcome;
  /** Accepted for boundary hardening, but never copied into the ledger. */
  [key: string]: unknown;
}

export interface TrainingAmortizationInput {
  provider: string;
  endpoint: string;
  model: string;
  pricingVersion: string;
  units: Record<string, number>;
  costUsd: number;
  latencyMs: number;
  requestId?: string;
  providerRequestId?: string;
  owningEntityIds: OwningEntityIds & { personaId: string };
}

export enum CostThreshold {
  GREEN = "green",
  AMBER = "amber",
  RED = "red",
}

export interface ThresholdInput {
  budgetUsd: number;
  actualCostUsd: number;
  /** P95 full-cap delivery margin, expressed as a percentage (e.g. 69.9). */
  p95FullCapMarginPercent?: number;
}

export type KillSwitchScope = "all" | "provider-model";

export interface ProviderKillSwitch {
  id: string;
  scope: KillSwitchScope;
  provider?: string;
  model?: string;
  threshold: CostThreshold;
  reason: string;
  createdAt: Date;
  active: boolean;
}

export interface SpendRoute {
  provider: string;
  model: string;
}

export class SpendBlockedError extends Error {
  readonly status = 503;
  readonly code = "provider_spend_disabled";
  constructor(readonly killSwitch: ProviderKillSwitch) {
    super(`Provider spend disabled: ${killSwitch.reason}`);
    this.name = "SpendBlockedError";
  }
}

export interface StorybookCostSummary {
  familyId: string;
  storybookId: string;
  attemptedCostUsd: number;
  successfulCostUsd: number;
  failedAttemptCostUsd: number;
  trainingAmortizationCostUsd: number;
  retryCount: number;
  attemptCount: number;
  entries: ProviderCostLedgerEntry[];
}

export interface PersonaTrainingCostSummary {
  familyId: string;
  personaId: string;
  amortizedCostUsd: number;
  attemptCount: number;
  entries: ProviderCostLedgerEntry[];
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
}

function assertUnits(units: Record<string, number>): Record<string, number> {
  const safeUnits: Record<string, number> = {};
  for (const [key, value] of Object.entries(units)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) throw new Error("Invalid unit name");
    assertFiniteNonNegative(value, `units.${key}`);
    safeUnits[key] = value;
  }
  return safeUnits;
}

function routeKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Append-only, secret-free provider COGS ledger and server-side spend policy.
 * Provider adapters should call this seam once for every attempt, including
 * failures and retries; this service never calls a paid provider itself.
 */
export class ProviderCostMeteringService {
  constructor(
    private readonly store: DataStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  recordAttempt(input: ProviderAttemptInput): ProviderCostLedgerEntry {
    const requestId = input.requestId ?? input.providerRequestId;
    if (
      !input.provider ||
      !input.endpoint ||
      !input.model ||
      !input.pricingVersion ||
      typeof requestId !== "string" ||
      !requestId
    ) {
      throw new Error("provider, endpoint, model, pricingVersion, and requestId are required");
    }
    if (!input.owningEntityIds?.familyId) throw new Error("familyId ownership is required");
    assertFiniteNonNegative(input.estimatedCostUsd, "estimatedCostUsd");
    if (input.actualCostUsd !== undefined) assertFiniteNonNegative(input.actualCostUsd, "actualCostUsd");
    assertFiniteNonNegative(input.latencyMs, "latencyMs");

    // Construct from an allow-list. In particular, never spread input: callers
    // may have accidentally supplied prompts, photo bytes, or credentials.
    const entry: ProviderCostLedgerEntry = {
      id: uuid(),
      provider: input.provider,
      endpoint: input.endpoint,
      model: input.model,
      pricingVersion: input.pricingVersion,
      units: assertUnits(input.units),
      estimatedCostUsd: input.estimatedCostUsd,
      actualCostUsd: input.actualCostUsd ?? null,
      latencyMs: input.latencyMs,
      requestId,
      providerRequestId: requestId,
      owningEntityIds: {
        familyId: input.owningEntityIds.familyId,
        ...(input.owningEntityIds.personaId ? { personaId: input.owningEntityIds.personaId } : {}),
        ...(input.owningEntityIds.storybookId
          ? { storybookId: input.owningEntityIds.storybookId }
          : {}),
        ...(input.owningEntityIds.pageId ? { pageId: input.owningEntityIds.pageId } : {}),
      },
      attemptType: input.attemptType,
      outcome: input.outcome,
      costCategory: "provider_attempt",
      createdAt: this.now(),
    };
    this.store.providerCostLedgerEntries.set(entry.id, entry);
    return entry;
  }

  recordTrainingAmortization(input: TrainingAmortizationInput): ProviderCostLedgerEntry {
    assertFiniteNonNegative(input.costUsd, "costUsd");
    const entry = this.recordAttempt({
      ...input,
      estimatedCostUsd: input.costUsd,
      actualCostUsd: input.costUsd,
      attemptType: "training",
      outcome: "succeeded",
    });
    entry.costCategory = "training_amortization";
    this.store.providerCostLedgerEntries.set(entry.id, entry);
    return entry;
  }

  listEntries(familyId: string): ProviderCostLedgerEntry[] {
    return [...this.store.providerCostLedgerEntries.values()].filter(
      (entry) => entry.owningEntityIds.familyId === familyId
    );
  }

  queryStorybookCost(familyId: string, storybookId: string): StorybookCostSummary {
    const entries = this.listEntries(familyId).filter(
      (entry) => entry.owningEntityIds.storybookId === storybookId
    );
    const storyAttempts = entries.filter((entry) => entry.costCategory === "provider_attempt");
    const costOf = (entry: ProviderCostLedgerEntry) => entry.actualCostUsd ?? entry.estimatedCostUsd;
    return {
      familyId,
      storybookId,
      attemptedCostUsd: entries.reduce((sum, entry) => sum + costOf(entry), 0),
      successfulCostUsd: storyAttempts
        .filter((entry) => entry.outcome === "succeeded")
        .reduce((sum, entry) => sum + costOf(entry), 0),
      failedAttemptCostUsd: storyAttempts
        .filter((entry) => entry.outcome !== "succeeded")
        .reduce((sum, entry) => sum + costOf(entry), 0),
      trainingAmortizationCostUsd: entries
        .filter((entry) => entry.costCategory === "training_amortization")
        .reduce((sum, entry) => sum + costOf(entry), 0),
      retryCount: storyAttempts.filter(
        (entry) => entry.attemptType === "retry" || entry.requestId.toLowerCase().includes("retry")
      ).length,
      attemptCount: storyAttempts.length,
      entries,
    };
  }

  /** Alias for reporting callers that use "storybook" rather than "Storybook". */
  getStorybookCost(familyId: string, storybookId: string): StorybookCostSummary {
    return this.queryStorybookCost(familyId, storybookId);
  }

  queryPersonaTrainingCost(familyId: string, personaId: string): PersonaTrainingCostSummary {
    const entries = this.listEntries(familyId).filter(
      (entry) =>
        entry.costCategory === "training_amortization" &&
        entry.owningEntityIds.personaId === personaId
    );
    return {
      familyId,
      personaId,
      amortizedCostUsd: entries.reduce(
        (sum, entry) => sum + (entry.actualCostUsd ?? entry.estimatedCostUsd),
        0
      ),
      attemptCount: entries.length,
      entries,
    };
  }

  evaluateThreshold(input: ThresholdInput): CostThreshold {
    if (!Number.isFinite(input.budgetUsd) || input.budgetUsd <= 0) {
      throw new Error("budgetUsd must be positive");
    }
    assertFiniteNonNegative(input.actualCostUsd, "actualCostUsd");
    if (
      input.p95FullCapMarginPercent !== undefined &&
      (!Number.isFinite(input.p95FullCapMarginPercent) || input.p95FullCapMarginPercent < 0)
    ) {
      throw new Error("p95FullCapMarginPercent must be a valid percentage");
    }
    if (input.p95FullCapMarginPercent !== undefined && input.p95FullCapMarginPercent < 70) {
      return CostThreshold.RED;
    }
    const variance = Math.abs(input.actualCostUsd - input.budgetUsd) / input.budgetUsd;
    const epsilon = Number.EPSILON * 16;
    if (variance <= 0.05 + epsilon) return CostThreshold.GREEN;
    if (variance <= 0.1 + epsilon) return CostThreshold.AMBER;
    return CostThreshold.RED;
  }

  setKillSwitch(input: Omit<ProviderKillSwitch, "id" | "createdAt" | "active">): ProviderKillSwitch {
    if (input.threshold !== CostThreshold.RED) {
      throw new Error("Only a red threshold may disable provider spend");
    }
    if (input.scope === "provider-model" && (!input.provider || !input.model)) {
      throw new Error("provider-model kill switches require provider and model");
    }
    const killSwitch: ProviderKillSwitch = {
      ...input,
      id: uuid(),
      createdAt: this.now(),
      active: true,
    };
    this.store.providerKillSwitches.set(killSwitch.id, killSwitch);
    return killSwitch;
  }

  clearKillSwitch(id: string): void {
    const killSwitch = this.store.providerKillSwitches.get(id);
    if (killSwitch) {
      killSwitch.active = false;
      this.store.providerKillSwitches.set(id, killSwitch);
    }
  }

  getKillSwitches(): ProviderKillSwitch[] {
    return [...this.store.providerKillSwitches.values()].filter((switchState) => switchState.active);
  }

  assertSpendAllowed(route: SpendRoute): void {
    const killSwitch = this.getKillSwitches().find(
      (switchState) =>
        switchState.scope === "all" ||
        (switchState.provider === route.provider && switchState.model === route.model)
    );
    if (killSwitch) throw new SpendBlockedError(killSwitch);
  }

  /** Budget gate used immediately before enqueue; red means no silent paid overage. */
  authorizeSpend(route: SpendRoute & ThresholdInput): CostThreshold {
    const threshold = this.evaluateThreshold(route);
    this.assertSpendAllowed(route);
    if (threshold === CostThreshold.RED) {
      throw new SpendBlockedError({
        id: "budget-threshold",
        scope: "provider-model",
        provider: route.provider,
        model: route.model,
        threshold,
        reason: "Budget variance exceeded the red threshold",
        createdAt: this.now(),
        active: true,
      });
    }
    return threshold;
  }

  getControls(): { canCreateSpend: boolean; canViewDrafts: true; canHardDelete: true } {
    return {
      canCreateSpend: this.getKillSwitches().length === 0,
      canViewDrafts: true,
      canHardDelete: true,
    };
  }

  /** Test helper only; does not exist on the production persistence boundary. */
  resetForTesting(): void {
    this.store.providerCostLedgerEntries.clear();
    this.store.providerKillSwitches.clear();
  }
}

/** Readable aliases for callers that describe this component as a ledger. */
export const ProviderCostLedgerService = ProviderCostMeteringService;
export { routeKey };
