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
/** Only a production adapter may declare real-provider evidence. */
export type R1ProviderE2EEvidenceSource = "real-provider" | "development" | "deterministic";

export interface R1ProviderE2EEnv {
  FAL_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LIVE_PROVIDER_BUDGET_USD?: string;
  LIVE_PROVIDER_RUN_APPROVED?: string;
}

export interface R1ProviderE2EConfig {
  budgetUsd: number;
  credentials: { fal: string; anthropic: string };
  liveRunApproved: true;
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

export type R1ProviderE2EStageDetail = string | number | boolean | null;

export interface R1ProviderE2EStageEvidence {
  stageId: string;
  status: "passed" | "failed";
  summary: string;
  details?: Record<string, R1ProviderE2EStageDetail>;
  redactedLog?: string;
}

export interface R1ProviderE2ECompositionResult {
  evidenceSource: R1ProviderE2EEvidenceSource;
  stageEvidence: R1ProviderE2EStageEvidence[];
  evidence: R1ProviderE2EEvidence[];
  storyAllowanceAccounting: R1ProviderE2EReport["storyAllowanceAccounting"];
  redactedLogs?: string[];
  reservedUsd?: number;
}

export interface R1ProviderE2EComposition {
  run(): Promise<R1ProviderE2ECompositionResult>;
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
  stageEvidence: R1ProviderE2EStageEvidence[];
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
  adapters?: R1ProviderE2EAdapters;
  composition?: R1ProviderE2EComposition;
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
    LIVE_PROVIDER_RUN_APPROVED: process.env.LIVE_PROVIDER_RUN_APPROVED,
  }
): R1ProviderE2EConfig {
  const fal = requiredCredential(env, "FAL_API_KEY");
  const anthropic = requiredCredential(env, "ANTHROPIC_API_KEY");
  if (env.LIVE_PROVIDER_RUN_APPROVED !== "true") {
    throw new R1ProviderE2EConfigError(
      "R1 provider e2e smoke refuses to run: LIVE_PROVIDER_RUN_APPROVED=true is required",
    );
  }
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
  return { budgetUsd, credentials: { fal, anthropic }, liveRunApproved: true };
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
      SENSITIVE_EVIDENCE_KEY.test(key) && typeof nested !== "number" && typeof nested !== "boolean" && nested !== null
        ? "[REDACTED]"
        : redactStructuredValue(nested),
    ]));
  }
  if (typeof value === "string") return redactLog(value);
  return value;
}

function redactLog(value: string): string {
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

function adaptersAvailable(adapters: R1ProviderE2EAdapters): boolean {
  return adapters.liveAdaptersWired && adapters.fal.available && adapters.anthropic.available;
}

function availableForRelease(adapters: R1ProviderE2EAdapters): boolean {
  return adaptersAvailable(adapters) &&
    adapters.fal.isDevOnly !== true &&
    adapters.anthropic.isDevOnly !== true &&
    adapters.fal.evidenceSource === "real-provider" &&
    adapters.anthropic.evidenceSource === "real-provider";
}

export async function runR1ProviderE2E({
  config,
  adapters,
  composition,
  now = () => new Date(),
  gate = {},
}: RunR1ProviderE2EOptions): Promise<R1ProviderE2EReport> {
  if (!Number.isFinite(config.budgetUsd) || config.budgetUsd <= 0 || config.budgetUsd > APPROVED_R1_PROVIDER_E2E_CEILING_USD) {
    throw new R1ProviderE2EConfigError("Invalid R1 provider e2e smoke budget");
  }
  if (config.liveRunApproved !== true) {
    throw new R1ProviderE2EConfigError("R1 provider e2e smoke requires explicit live-run approval");
  }
  if (composition && adapters) {
    throw new R1ProviderE2EConfigError("Choose either an R1 provider composition or provider adapters, not both");
  }
  const started = now();
  const evidence: R1ProviderE2EEvidence[] = [];
  const stageEvidence: R1ProviderE2EStageEvidence[] = [];
  const logs: string[] = [];
  let reservedUsd = 0;
  let compositionEvidenceSource: R1ProviderE2EEvidenceSource | undefined;
  let storyAllowanceAccounting: R1ProviderE2EReport["storyAllowanceAccounting"] = {
    allowed: DEFAULT_R1_PROVIDER_E2E_MANIFEST.storyAllowancePerFamily,
    reserved: 0,
    released: 0,
    committed: 0,
    remaining: DEFAULT_R1_PROVIDER_E2E_MANIFEST.storyAllowancePerFamily,
  };
  if (composition) {
    const result = await composition.run();
    compositionEvidenceSource = result.evidenceSource;
    const knownStages = new Set<string>(R1_PROVIDER_E2E_FLOW_PLAN.map((item) => item.id));
    const seenStages = new Set<string>();
    for (const item of result.stageEvidence) {
      if (!knownStages.has(item.stageId) || seenStages.has(item.stageId)) {
        throw new R1ProviderE2EConfigError(`Invalid or duplicate R1 stage evidence: ${item.stageId}`);
      }
      seenStages.add(item.stageId);
      stageEvidence.push({
        ...item,
        summary: redactLog(item.summary),
        details: item.details
          ? redactStructuredValue(item.details) as Record<string, R1ProviderE2EStageDetail>
          : undefined,
        redactedLog: item.redactedLog ? redactLog(item.redactedLog) : undefined,
      });
    }
    evidence.push(...result.evidence.map((item) => ({ ...item, redactedLog: redactLog(item.redactedLog) })));
    const accounting = result.storyAllowanceAccounting;
    const accountingValues = [
      accounting.allowed,
      accounting.reserved,
      accounting.released,
      accounting.committed,
      accounting.remaining,
    ];
    if (
      accounting.allowed !== DEFAULT_R1_PROVIDER_E2E_MANIFEST.storyAllowancePerFamily ||
      accountingValues.some((value) => !Number.isInteger(value) || value < 0) ||
      accounting.reserved + accounting.committed > accounting.allowed ||
      accounting.remaining !== accounting.allowed - accounting.reserved - accounting.committed
    ) {
      throw new R1ProviderE2EConfigError("Invalid R1 Story allowance evidence");
    }
    storyAllowanceAccounting = { ...accounting };
    reservedUsd = result.reservedUsd ?? 0;
    if (!Number.isFinite(reservedUsd) || reservedUsd < 0 || reservedUsd > config.budgetUsd) {
      throw new R1ProviderE2EBudgetError("R1 provider composition exceeded its authorized reservation");
    }
    logs.push(...(result.redactedLogs ?? []).map(redactLog));
  } else if (adapters && adaptersAvailable(adapters)) {
    for (const operation of DEFAULT_OPERATIONS) {
      if (reservedUsd + operation.maxCostUsd > config.budgetUsd + Number.EPSILON) {
        throw new R1ProviderE2EBudgetError(`R1 provider e2e hard stop before ${operation.operationId}`);
      }
      reservedUsd += operation.maxCostUsd;
      const operationStarted = now();
      const adapter = adapters[operation.provider];
      try {
        const result = await adapter.run(operation);
        const requestId = typeof result.requestId === "string" ? result.requestId.trim() : "";
        const durationMs = typeof result.durationMs === "number" ? result.durationMs : Number.NaN;
        const actualCostUsd = typeof result.actualCostUsd === "number" ? result.actualCostUsd : Number.NaN;
        const providerEvidenceIsValid =
          result.status === "succeeded" &&
          requestId.length >= 8 &&
          result.provider === operation.provider &&
          result.endpoint === operation.endpoint &&
          result.model === operation.model &&
          result.pricingVersion === operation.pricingVersion &&
          Number.isFinite(durationMs) && durationMs >= 0 &&
          Number.isFinite(actualCostUsd) && actualCostUsd >= 0 && actualCostUsd <= operation.maxCostUsd;
        if (!providerEvidenceIsValid) {
          throw new R1ProviderE2EBudgetError(`Incomplete or mismatched provider evidence for ${operation.operationId}`);
        }
        evidence.push({
          requestId,
          evidenceSource: adapter.evidenceSource ?? "deterministic",
          provider: operation.provider,
          endpoint: operation.endpoint,
          model: operation.model,
          pricingVersion: operation.pricingVersion,
          status: "succeeded",
          durationMs,
          actualCostUsd,
          redactedLog: redactLog(result.redactedLog ?? `${operation.operationId} completed without retained payload`),
        });
      } catch {
        evidence.push({
          requestId: `${operation.operationId}:error`,
          evidenceSource: adapter.evidenceSource ?? "deterministic",
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
    logs.push("Live provider composition is unavailable; no provider call was attempted");
  }

  const statusByStage = new Map<string, R1ProviderE2EFlowItem["status"]>();
  for (const item of stageEvidence) {
    statusByStage.set(item.stageId, item.status);
  }
  if (!composition) {
    for (const item of evidence) {
      const stageId = DEFAULT_OPERATIONS.find(
        (operation) => operation.endpoint === item.endpoint && operation.model === item.model,
      )?.stageId;
      if (stageId) {
        statusByStage.set(stageId, item.status === "succeeded" ? "passed" : "failed");
      }
    }
  }
  const flowPlan: R1ProviderE2EFlowItem[] = R1_PROVIDER_E2E_FLOW_PLAN.map((item) => ({
    ...item,
    status: statusByStage.get(item.id) ?? "pending",
  }));
  const flowChecklist = {
    total: flowPlan.length,
    passed: flowPlan.filter((item) => item.status === "passed").length,
    failed: flowPlan.filter((item) => item.status === "failed").length,
    pending: flowPlan.filter((item) => item.status === "pending").length,
  };
  const actualProviderCostUsd = evidence.reduce((sum, item) => sum + item.actualCostUsd, 0);
  const completed = now();
  const providerRouteEligible = composition
    ? compositionEvidenceSource === "real-provider"
    : adapters ? availableForRelease(adapters) : false;
  const releaseEvidenceEligible =
    providerRouteEligible &&
    evidence.length > 0 &&
    evidence.every((item) =>
      item.evidenceSource === "real-provider" && (composition !== undefined || item.status === "succeeded")
    ) &&
    evidence.some((item) => item.status === "succeeded") &&
    new Set(evidence.map((item) => item.requestId)).size === evidence.length &&
    flowChecklist.pending === 0 &&
    flowChecklist.failed === 0;
  const decision = evaluateR1ProviderE2EGate({
    modeledAnnualFullCapP95MarginPercent: gate.modeledAnnualFullCapP95MarginPercent ?? 70,
    ordinaryStoryCost: gate.ordinaryStoryCost ?? { threshold: CostThreshold.GREEN },
    selectedRoute: gate.selectedRoute ?? DEFAULT_GATE_ROUTE,
    canaryDecision: gate.canaryDecision ?? DEFAULT_GATE_ROUTE,
    approvalFlag: gate.approvalFlag ?? false,
    releaseEvidenceAvailable: releaseEvidenceEligible,
  });
  if (decision.status === "blocked" && flowChecklist.pending > 0) {
    decision.missingEvidence.push(
      `${flowChecklist.pending} required R1 flow stages remain unexecuted`,
    );
  }
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
    flowPlan,
    flowChecklist,
    stageEvidence,
    requestIds: evidence.map((item) => item.requestId),
    redactedLogs: logs.concat(evidence.map((item) => item.redactedLog)).map(redactLog),
    evidence,
    actualProviderCostUsd,
    storyAllowanceAccounting,
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
