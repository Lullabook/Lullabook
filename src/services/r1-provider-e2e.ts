import { CostThreshold } from "@/services/provider-cost-metering";

export { CostThreshold };

export const APPROVED_R1_PROVIDER_E2E_CEILING_USD = 2;
export const R1_PROVIDER_E2E_TICKET = 185 as const;
export const R1_PROVIDER_E2E_SCHEMA_VERSION = "185-r1-provider-e2e/v1" as const;

export const DEFAULT_R1_PROVIDER_E2E_MANIFEST = {
  goldenSetId: "r1-family-persona-story-golden-v1",
  fixturePolicy: {
    allowedSubjects: ["synthetic-subjects", "consenting-adults"],
    prohibitedSubjects: ["minors", "unrelated-personal-data"],
    statement:
      "Only synthetic subjects or documented consenting adults may enter this smoke; no minor photos or unrelated personal data.",
  },
  flowPlan: [
    { id: "trial", label: "Trial" },
    { id: "consent", label: "Email-Plus VPC consent" },
    { id: "family-roster", label: "Multiple Family people and Babies" },
    { id: "train", label: "Train every selected Persona" },
    { id: "review-accept", label: "Review and accept likeness" },
    { id: "brief", label: "Submit Brief" },
    { id: "valid-story", label: "Generate and validate a valid Story" },
    { id: "twelve-page-jobs", label: "Fan out 12 Page jobs" },
    { id: "readable-draft", label: "Open a readable draft" },
    { id: "two-persona-scene", label: "Two-Persona Scene preserves distinct likenesses and Style Bible" },
    { id: "forced-text-failure", label: "Forced text failure reaches a recoverable terminal state" },
    { id: "page-failure", label: "Page failure reaches a recoverable terminal state" },
    { id: "duplicate-callback", label: "Duplicate callback is idempotent" },
    { id: "repair-failure", label: "Repair failure reaches a visible recovery state" },
    { id: "rls-cross-family-denial", label: "RLS cross-Family denial" },
    { id: "hard-delete", label: "Hard-delete inventory and erasure" },
  ],
  storyPageCount: 12,
  storyAllowancePerFamily: 4,
} as const;

export const R1_PROVIDER_E2E_FLOW_PLAN = DEFAULT_R1_PROVIDER_E2E_MANIFEST.flowPlan;

export type R1ProviderE2EProvider = "fal" | "anthropic";
export type R1ProviderE2EStatus = "succeeded" | "failed";

export interface R1ProviderE2EEnv {
  FAL_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LIVE_PROVIDER_BUDGET_USD?: string;
}

export interface R1ProviderE2EConfig {
  budgetUsd: number;
  credentials: { fal: string; anthropic: string };
}

export class R1ProviderE2EConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R1ProviderE2EConfigError";
  }
}

export class R1ProviderE2EBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R1ProviderE2EBudgetError";
  }
}

export interface R1ProviderE2EOperation {
  operationId: string;
  stageId: string;
  provider: R1ProviderE2EProvider;
  endpoint: string;
  model: string;
  pricingVersion: string;
  maxCostUsd: number;
}

export interface R1ProviderE2EEvidence {
  requestId: string;
  provider: R1ProviderE2EProvider;
  endpoint: string;
  model: string;
  pricingVersion: string;
  status: R1ProviderE2EStatus;
  durationMs: number;
  actualCostUsd: number;
  redactedLog: string;
}

export interface R1ProviderE2EAdapter {
  /** False means this seam is intentionally unavailable in the deterministic harness. */
  available: boolean;
  /** Development fakes never satisfy release evidence. */
  isDevOnly?: boolean;
  run(operation: R1ProviderE2EOperation): Promise<Partial<R1ProviderE2EEvidence>>;
}

export interface R1ProviderE2EAdapters {
  liveAdaptersWired: boolean;
  fal: R1ProviderE2EAdapter;
  anthropic: R1ProviderE2EAdapter;
}

export interface R1ProviderE2EFlowItem {
  id: string;
  label: string;
  status: "pending" | "passed" | "failed";
}

export interface R1ProviderE2EGateRoute {
  provider: string;
  model: string;
}

export interface R1ProviderE2EGateInput {
  modeledAnnualFullCapP95MarginPercent: number;
  ordinaryStoryCost: {
    threshold: CostThreshold;
    actualCostUsd?: number;
    budgetUsd?: number;
  };
  selectedRoute: R1ProviderE2EGateRoute;
  canaryDecision: R1ProviderE2EGateRoute;
  approvalFlag?: boolean;
  releaseEvidenceAvailable: boolean;
}

export interface R1ProviderE2EGateDecision {
  status: "passed" | "failed" | "blocked";
  failures: string[];
  missingEvidence: string[];
  rationale: string;
}

export interface R1ProviderE2EReport {
  schemaVersion: typeof R1_PROVIDER_E2E_SCHEMA_VERSION;
  ticket: typeof R1_PROVIDER_E2E_TICKET;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  budget: {
    configuredUsd: number;
    approvedCeilingUsd: number;
    reservedUsd: number;
    actualProviderCostUsd: number;
    remainingUsd: number;
  };
  fixturePolicy: typeof DEFAULT_R1_PROVIDER_E2E_MANIFEST.fixturePolicy;
  flowPlan: readonly typeof DEFAULT_R1_PROVIDER_E2E_MANIFEST.flowPlan[number][];
  flowChecklist: { total: number; passed: number; failed: number; pending: number };
  requestIds: string[];
  redactedLogs: string[];
  evidence: R1ProviderE2EEvidence[];
  actualProviderCostUsd: number;
  storyAllowanceAccounting: {
    allowed: number;
    reserved: number;
    released: number;
    committed: number;
    remaining: number;
  };
  modelVersions: Record<string, string>;
  pricingVersions: Record<string, string>;
  decision: R1ProviderE2EGateDecision;
  releaseEvidenceEligible: boolean;
  productionRoutingMutated: false;
}

export interface RunR1ProviderE2EOptions {
  config: R1ProviderE2EConfig;
  adapters: R1ProviderE2EAdapters;
  now?: () => Date;
  gate?: Partial<Omit<R1ProviderE2EGateInput, "releaseEvidenceAvailable">>;
}

const DEFAULT_GATE_ROUTE: R1ProviderE2EGateRoute = {
  provider: "fal.ai",
  model: "fal-ai/flux-2/lora",
};

const DEFAULT_OPERATIONS: R1ProviderE2EOperation[] = [
  {
    operationId: "r1-train-personas",
    stageId: "train",
    provider: "fal",
    endpoint: "fal-ai/flux-2-trainer-v2",
    model: "flux-2-lora-v2",
    pricingVersion: "fal-2026-07-20",
    maxCostUsd: 0.4,
  },
  {
    operationId: "r1-story-text",
    stageId: "valid-story",
    provider: "anthropic",
    endpoint: "anthropic.messages.create",
    model: "claude-sonnet-4-6",
    pricingVersion: "anthropic-2026-07-20",
    maxCostUsd: 0.2,
  },
  {
    operationId: "r1-page-fanout",
    stageId: "twelve-page-jobs",
    provider: "fal",
    endpoint: "fal-ai/flux-2/lora",
    model: "flux-2-lora",
    pricingVersion: "fal-2026-07-20",
    maxCostUsd: 0.8,
  },
];

function requiredCredential(env: R1ProviderE2EEnv, name: "FAL_API_KEY" | "ANTHROPIC_API_KEY"): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new R1ProviderE2EConfigError(
      `R1 provider e2e smoke refuses to run: explicit ${name} is required`
    );
  }
  return value;
}

export function createR1ProviderE2EConfig(
  env: R1ProviderE2EEnv = {
    FAL_API_KEY: process.env.FAL_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    LIVE_PROVIDER_BUDGET_USD: process.env.LIVE_PROVIDER_BUDGET_USD,
  }
): R1ProviderE2EConfig {
  const fal = requiredCredential(env, "FAL_API_KEY");
  const anthropic = requiredCredential(env, "ANTHROPIC_API_KEY");
  const rawBudget = env.LIVE_PROVIDER_BUDGET_USD?.trim();
  const budgetUsd = rawBudget === undefined ? Number.NaN : Number(rawBudget);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new R1ProviderE2EConfigError(
      "R1 provider e2e smoke refuses to run: LIVE_PROVIDER_BUDGET_USD must be positive"
    );
  }
  if (budgetUsd > APPROVED_R1_PROVIDER_E2E_CEILING_USD) {
    throw new R1ProviderE2EConfigError(
      `LIVE_PROVIDER_BUDGET_USD exceeds the approved $${APPROVED_R1_PROVIDER_E2E_CEILING_USD} ceiling`
    );
  }
  return { budgetUsd, credentials: { fal, anthropic } };
}

export function evaluateR1ProviderE2EGate(input: R1ProviderE2EGateInput): R1ProviderE2EGateDecision {
  const failures: string[] = [];
  if (input.modeledAnnualFullCapP95MarginPercent < 70) {
    failures.push("Modeled annual full-cap/P95 delivery margin is below the 70% floor");
  }
  if (input.ordinaryStoryCost.threshold === CostThreshold.RED) {
    failures.push("Ordinary Story cost is red");
  }
  const routeMatches =
    input.selectedRoute.provider === input.canaryDecision.provider &&
    input.selectedRoute.model === input.canaryDecision.model;
  if (!routeMatches && input.approvalFlag !== true) {
    failures.push("Selected provider/model differs from the canary decision without an approval flag");
  }
  if (failures.length > 0) {
    return {
      status: "failed",
      failures,
      missingEvidence: [],
      rationale: "The release gate is closed until every economic and routing invariant passes.",
    };
  }
  if (!input.releaseEvidenceAvailable) {
    return {
      status: "blocked",
      failures: [],
      missingEvidence: [
        "live fal.ai training, Story, and Page responses",
        "live Anthropic Story response",
        "request-level cost and latency evidence from non-development adapters",
      ],
      rationale: "The deterministic harness held the gate; development fakes cannot produce release evidence.",
    };
  }
  return {
    status: "passed",
    failures: [],
    missingEvidence: [],
    rationale: "Economic, ordinary Story cost, routing, and live-evidence checks passed.",
  };
}

function redactLog(value: string): string {
  return value
    .replace(/(credential|secret|token|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/prompt\s*[:=].*$/gi, "prompt=[REDACTED]")
    .replace(/photo(?:s| bytes)?\s*[:=].*$/gi, "photo=[REDACTED]")
    .slice(0, 500);
}

function availableForRelease(adapters: R1ProviderE2EAdapters): boolean {
  return adapters.liveAdaptersWired &&
    adapters.fal.available &&
    adapters.anthropic.available &&
    adapters.fal.isDevOnly !== true &&
    adapters.anthropic.isDevOnly !== true;
}

export async function runR1ProviderE2E({
  config,
  adapters,
  now = () => new Date(),
  gate = {},
}: RunR1ProviderE2EOptions): Promise<R1ProviderE2EReport> {
  if (!Number.isFinite(config.budgetUsd) || config.budgetUsd <= 0 || config.budgetUsd > APPROVED_R1_PROVIDER_E2E_CEILING_USD) {
    throw new R1ProviderE2EConfigError("Invalid R1 provider e2e smoke budget");
  }
  const started = now();
  const evidence: R1ProviderE2EEvidence[] = [];
  const logs: string[] = [];
  let reservedUsd = 0;
  if (availableForRelease(adapters)) {
    for (const operation of DEFAULT_OPERATIONS) {
      if (reservedUsd + operation.maxCostUsd > config.budgetUsd + Number.EPSILON) {
        throw new R1ProviderE2EBudgetError(`R1 provider e2e hard stop before ${operation.operationId}`);
      }
      reservedUsd += operation.maxCostUsd;
      const operationStarted = now();
      try {
        const result = await adapters[operation.provider].run(operation);
        const actualCostUsd = result.actualCostUsd ?? 0;
        if (!Number.isFinite(actualCostUsd) || actualCostUsd < 0 || actualCostUsd > operation.maxCostUsd) {
          throw new R1ProviderE2EBudgetError(`Invalid actual provider cost for ${operation.operationId}`);
        }
        evidence.push({
          requestId: result.requestId ?? `${operation.operationId}:missing-request-id`,
          provider: operation.provider,
          endpoint: operation.endpoint,
          model: operation.model,
          pricingVersion: operation.pricingVersion,
          status: result.status ?? "succeeded",
          durationMs: Math.max(0, now().getTime() - operationStarted.getTime()),
          actualCostUsd,
          redactedLog: redactLog(result.redactedLog ?? `${operation.operationId} completed without retained payload`),
        });
      } catch {
        evidence.push({
          requestId: `${operation.operationId}:error`,
          provider: operation.provider,
          endpoint: operation.endpoint,
          model: operation.model,
          pricingVersion: operation.pricingVersion,
          status: "failed",
          durationMs: Math.max(0, now().getTime() - operationStarted.getTime()),
          actualCostUsd: 0,
          redactedLog: `Provider operation ${operation.operationId} failed; sensitive payloads were not retained`,
        });
      }
    }
  } else {
    logs.push("Live provider adapters are unavailable; no provider call was attempted");
  }

  const actualProviderCostUsd = evidence.reduce((sum, item) => sum + item.actualCostUsd, 0);
  const completed = now();
  const releaseEvidenceEligible = availableForRelease(adapters) && evidence.length > 0 && evidence.every((item) => item.status === "succeeded");
  const decision = evaluateR1ProviderE2EGate({
    modeledAnnualFullCapP95MarginPercent: gate.modeledAnnualFullCapP95MarginPercent ?? 70,
    ordinaryStoryCost: gate.ordinaryStoryCost ?? { threshold: CostThreshold.GREEN },
    selectedRoute: gate.selectedRoute ?? DEFAULT_GATE_ROUTE,
    canaryDecision: gate.canaryDecision ?? DEFAULT_GATE_ROUTE,
    approvalFlag: gate.approvalFlag ?? false,
    releaseEvidenceAvailable: releaseEvidenceEligible,
  });
  return {
    schemaVersion: R1_PROVIDER_E2E_SCHEMA_VERSION,
    ticket: R1_PROVIDER_E2E_TICKET,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    durationMs: Math.max(0, completed.getTime() - started.getTime()),
    budget: {
      configuredUsd: config.budgetUsd,
      approvedCeilingUsd: APPROVED_R1_PROVIDER_E2E_CEILING_USD,
      reservedUsd,
      actualProviderCostUsd,
      remainingUsd: Math.max(0, config.budgetUsd - actualProviderCostUsd),
    },
    fixturePolicy: DEFAULT_R1_PROVIDER_E2E_MANIFEST.fixturePolicy,
    flowPlan: R1_PROVIDER_E2E_FLOW_PLAN.map((item) => ({ ...item, status: "pending" as const })),
    flowChecklist: { total: R1_PROVIDER_E2E_FLOW_PLAN.length, passed: 0, failed: 0, pending: R1_PROVIDER_E2E_FLOW_PLAN.length },
    requestIds: evidence.map((item) => item.requestId),
    redactedLogs: logs.concat(evidence.map((item) => item.redactedLog)).map(redactLog),
    evidence,
    actualProviderCostUsd,
    storyAllowanceAccounting: {
      allowed: DEFAULT_R1_PROVIDER_E2E_MANIFEST.storyAllowancePerFamily,
      reserved: 0,
      released: 0,
      committed: 0,
      remaining: DEFAULT_R1_PROVIDER_E2E_MANIFEST.storyAllowancePerFamily,
    },
    modelVersions: {
      training: "flux-2-trainer-v2",
      illustration: "flux-2-lora-v1",
      story: "claude-sonnet-4-6",
      pageRepair: "nano-banana-2-edit-v1",
    },
    pricingVersions: {
      fal: "fal-2026-07-20",
      anthropic: "anthropic-2026-07-20",
      platformReserve: "r1-economics-2026-07-20",
    },
    decision,
    releaseEvidenceEligible,
    productionRoutingMutated: false,
  };
}

export type ExistingR1ProviderE2EAdapter = R1ProviderE2EAdapter;
