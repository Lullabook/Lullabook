import { CostThreshold } from "@/services/provider-cost-metering";

import type {
  R1ProviderE2EServiceAdapters,
} from "@/services/r1-provider-e2e-composition";
import { runComposedR1ProviderE2E } from "@/services/r1-provider-e2e-composition";

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
/** Only a production adapter may declare real-provider evidence. */
export type R1ProviderE2EEvidenceSource = "real-provider" | "development" | "deterministic";

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
  evidenceSource: R1ProviderE2EEvidenceSource;
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
  /** Explicit provenance; omitted provenance fails closed as deterministic. */
  evidenceSource?: R1ProviderE2EEvidenceSource;
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
  flowPlan: readonly R1ProviderE2EFlowItem[];
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
  serviceAdapters?: Partial<R1ProviderE2EServiceAdapters>;
  now?: () => Date;
  gate?: Partial<Omit<R1ProviderE2EGateInput, "releaseEvidenceAvailable">>;
}

export const DEFAULT_GATE_ROUTE: R1ProviderE2EGateRoute = {
  provider: "fal.ai",
  model: "fal-ai/flux-2/lora",
};


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

const SENSITIVE_EVIDENCE_KEY = /credential|secret|token|api[_-]?key|authorization|prompt|photo|image|media/i;

function redactStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStructuredValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_EVIDENCE_KEY.test(key) ? "[REDACTED]" : redactStructuredValue(nested),
    ]));
  }
  return value;
}

export function redactLog(value: string): string {
  let sanitized = value;
  try {
    sanitized = JSON.stringify(redactStructuredValue(JSON.parse(value)));
  } catch {
    // Text logs are still treated as untrusted: redact quoted JSON-like values,
    // key/value fragments, and provider URLs before preserving a short receipt.
    sanitized = value.replace(
      /(["']?(?:credential|secret|token|api[_-]?key|authorization|prompt|photo(?:s|[_ -]?bytes)?|image|media)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi,
      "$1[REDACTED]",
    );
  }
  return sanitized
    .replace(/https?:\/\/[^\s"',;}\]]+/gi, "[REDACTED_URL]")
    .slice(0, 500);
}

export async function runR1ProviderE2E({
  config,
  adapters,
  serviceAdapters,
  now = () => new Date(),
  gate = {},
}: RunR1ProviderE2EOptions): Promise<R1ProviderE2EReport> {
  const result = await runComposedR1ProviderE2E({
    config,
    adapters,
    serviceAdapters,
    now,
    gate,
  });
  return result.report;
}

export type ExistingR1ProviderE2EAdapter = R1ProviderE2EAdapter;
