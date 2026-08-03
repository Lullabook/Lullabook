import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import { R1_MARGIN_THRESHOLDS, R1_PLAN_DEFINITION } from "@/domain/plan";

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
  | "unknown"
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

/**
 * Margin evidence (COST-3): net subscription revenue and attributable COGS.
 * Margin = (net subscription revenue − attributable COGS) / net subscription
 * revenue × 100. Missing evidence fails closed at the authorization boundary.
 */
export interface MarginEvidence {
  netSubscriptionRevenueUsd: number;
  attributableCogsUsd: number;
}

/**
 * Issue 190 — margin formula: (net subscription revenue − attributable COGS)
 * / net subscription revenue × 100. Invalid revenue (missing evidence) or
 * negative COGS throws: never divide by zero, never compute a fake margin.
 */
export function computeMarginPercent(
  netSubscriptionRevenueUsd: number,
  attributableCogsUsd: number
): number {
  if (!Number.isFinite(netSubscriptionRevenueUsd) || netSubscriptionRevenueUsd <= 0) {
    throw new Error("netSubscriptionRevenueUsd must be a finite positive number");
  }
  assertFiniteNonNegative(attributableCogsUsd, "attributableCogsUsd");
  return ((netSubscriptionRevenueUsd - attributableCogsUsd) / netSubscriptionRevenueUsd) * 100;
}

export type KillSwitchScope = "all" | "provider" | "model" | "endpoint" | "provider-model";

export interface ProviderKillSwitch {
  id: string;
  /** Undefined means a global control; otherwise the control belongs to one Family. */
  familyId?: string;
  scope: KillSwitchScope;
  provider?: string;
  model?: string;
  endpoint?: string;
  threshold: CostThreshold;
  reason: string;
  createdAt: Date;
  active: boolean;
}

export interface SpendRoute {
  familyId?: string;
  provider: string;
  model: string;
  endpoint?: string;
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
    if (
      !["text", "image", "training", "moderation", "storage", "queue", "retry", "repair"].includes(
        input.attemptType
      )
    ) {
      throw new Error("Invalid provider attempt type");
    }
    if (![
      "succeeded",
      "failed",
      "unknown",
      "retried",
      "cancelled",
      "timed_out",
    ].includes(input.outcome)) {
      throw new Error("Invalid provider attempt outcome");
    }
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
    if (
      input.p95FullCapMarginPercent !== undefined &&
      input.p95FullCapMarginPercent < R1_MARGIN_THRESHOLDS.fullCapP95MarginFloorPercent
    ) {
      return CostThreshold.RED;
    }
    const variance = Math.abs(input.actualCostUsd - input.budgetUsd) / input.budgetUsd;
    const epsilon = Number.EPSILON * 16;
    if (variance <= R1_MARGIN_THRESHOLDS.greenVarianceMaxPercent / 100 + epsilon) {
      return CostThreshold.GREEN;
    }
    if (variance <= R1_MARGIN_THRESHOLDS.amberVarianceMaxPercent / 100 + epsilon) {
      return CostThreshold.AMBER;
    }
    return CostThreshold.RED;
  }

  setKillSwitch(input: Omit<ProviderKillSwitch, "id" | "createdAt" | "active">): ProviderKillSwitch {
    if (input.threshold !== CostThreshold.RED) {
      throw new Error("Only a red threshold may disable provider spend");
    }
    if (input.scope === "provider" && !input.provider) {
      throw new Error("provider kill switches require a provider");
    }
    if (input.scope === "model" && !input.model) {
      throw new Error("model kill switches require a model");
    }
    if (input.scope === "endpoint" && !input.endpoint) {
      throw new Error("endpoint kill switches require an endpoint");
    }
    if (input.scope === "provider-model" && (!input.provider || !input.model)) {
      throw new Error("provider-model kill switches require provider and model");
    }
    // Do not spread this input: unlike audit rows, a switch is itself an
    // authorization boundary and must not retain unreviewed caller metadata.
    const killSwitch: ProviderKillSwitch = {
      id: uuid(),
      ...(input.familyId ? { familyId: input.familyId } : {}),
      scope: input.scope,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      threshold: CostThreshold.RED,
      reason: input.reason,
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
    const killSwitch = this.getKillSwitches().find((switchState) => {
      if (switchState.familyId && route.familyId && switchState.familyId !== route.familyId) {
        return false;
      }
      if (switchState.scope === "all") return true;
      if (switchState.scope === "provider") return switchState.provider === route.provider;
      if (switchState.scope === "model") return switchState.model === route.model;
      if (switchState.scope === "endpoint") return switchState.endpoint === route.endpoint;
      return switchState.provider === route.provider && switchState.model === route.model;
    });
    if (killSwitch) throw new SpendBlockedError(killSwitch);
  }

  /**
   * Issue 190 — the pre-attempt authorization gate. Always enforces persisted
   * kill switches; then requires margin evidence (P95 full-cap margin or
   * net-revenue/COGS) and fails CLOSED when it is missing; then enforces the
   * red variance band when budget evidence is supplied. Returns green/amber;
   * any red condition throws {@link SpendBlockedError} before the caller can
   * reach a provider boundary.
   */
  authorizeSpend(input: SpendAuthorizationInput): CostThreshold {
    this.assertSpendAllowed(input);
    const margin = this.resolveMarginPercent(input);
    if (margin < R1_MARGIN_THRESHOLDS.fullCapP95MarginFloorPercent) {
      throw new SpendBlockedError({
        id: "margin-threshold",
        scope: "provider-model",
        provider: input.provider,
        model: input.model,
        threshold: CostThreshold.RED,
        reason: `Full-cap/P95 delivery margin (${margin.toFixed(2)}%) is below the ${R1_MARGIN_THRESHOLDS.fullCapP95MarginFloorPercent}% floor`,
        createdAt: this.now(),
        active: true,
      });
    }
    if (input.budgetUsd !== undefined || input.actualCostUsd !== undefined) {
      if (input.budgetUsd === undefined || input.actualCostUsd === undefined) {
        throw new Error("budgetUsd and actualCostUsd must be supplied together");
      }
      const threshold = this.evaluateThreshold({
        budgetUsd: input.budgetUsd,
        actualCostUsd: input.actualCostUsd,
      });
      if (threshold === CostThreshold.RED) {
        throw new SpendBlockedError({
          id: "budget-threshold",
          scope: "provider-model",
          provider: input.provider,
          model: input.model,
          threshold,
          reason: "Budget variance exceeded the red threshold",
          createdAt: this.now(),
          active: true,
        });
      }
      return threshold;
    }
    return CostThreshold.GREEN;
  }

  private resolveMarginPercent(input: SpendAuthorizationInput): number {
    if (input.p95FullCapMarginPercent !== undefined) {
      if (
        !Number.isFinite(input.p95FullCapMarginPercent) ||
        input.p95FullCapMarginPercent < 0
      ) {
        throw new Error("p95FullCapMarginPercent must be a valid percentage");
      }
      return input.p95FullCapMarginPercent;
    }
    if (input.marginEvidence) {
      if (
        !Number.isFinite(input.marginEvidence.netSubscriptionRevenueUsd) ||
        input.marginEvidence.netSubscriptionRevenueUsd <= 0
      ) {
        throw new SpendBlockedError({
          id: "missing-margin-evidence",
          scope: "all",
          threshold: CostThreshold.RED,
          reason: "Missing net subscription revenue evidence",
          createdAt: this.now(),
          active: true,
        });
      }
      return computeMarginPercent(
        input.marginEvidence.netSubscriptionRevenueUsd,
        input.marginEvidence.attributableCogsUsd
      );
    }
    // Missing margin evidence fails closed: no P95 margin, no revenue/COGS.
    throw new SpendBlockedError({
      id: "missing-margin-evidence",
      scope: "all",
      threshold: CostThreshold.RED,
      reason: "Missing margin evidence (P95 margin or revenue/COGS)",
      createdAt: this.now(),
      active: true,
    });
  }

  /**
   * Issue 190 — deterministic margin evidence derived from persisted state:
   * the Family's subscription revenue (R1 plan, monthly-equivalent) and the
   * attributable COGS recorded in the provider ledger. Returns null when the
   * Family has no active subscription — upstream authorization fails closed
   * rather than spending without revenue evidence.
   */
  deriveMarginEvidence(familyId: string): MarginEvidence | null {
    const subscription = this.store.getSubscription(familyId);
    if (!subscription || subscription.status !== "active") return null;
    const pricing = R1_PLAN_DEFINITION.pricing;
    const netSubscriptionRevenueUsd = pricing.annualDefault
      ? pricing.annual / 12
      : pricing.monthly;
    const attributableCogsUsd = [...this.store.providerCostLedgerEntries.values()]
      .filter((entry) => entry.owningEntityIds.familyId === familyId)
      .reduce((sum, entry) => sum + (entry.actualCostUsd ?? entry.estimatedCostUsd), 0);
    return { netSubscriptionRevenueUsd, attributableCogsUsd };
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

export interface SpendAuthorizationInput extends SpendRoute {
  /**
   * Budget variance evidence: cumulative spend vs the monthly budget. The
   * variance band is enforced only when BOTH are supplied.
   */
  budgetUsd?: number;
  actualCostUsd?: number;
  /** P95 full-cap delivery margin, expressed as a percentage (e.g. 69.9). */
  p95FullCapMarginPercent?: number;
  /** Alternative margin evidence: net subscription revenue + attributable COGS. */
  marginEvidence?: MarginEvidence;
}

/** Readable aliases for callers that describe this component as a ledger. */
export const ProviderCostLedgerService = ProviderCostMeteringService;
export { routeKey };
