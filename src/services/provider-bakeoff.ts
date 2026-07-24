import type { AnthropicAdapter, FalAdapter, FalImageResult, FalTrainResult } from "@/adapters/types";

export const APPROVED_PROVIDER_BAKEOFF_CEILING_USD = 10;
export const FLUX_2_TRAINER_ENDPOINT = "fal-ai/flux-2-trainer-v2";
export const FLUX_2_LORA_ENDPOINT = "fal-ai/flux-2/lora";
export const FLUX_1_LORA_ENDPOINT = "fal-ai/flux-lora";
export const SONNET_4_6_MODEL = "claude-sonnet-4-6";
export const SONNET_5_MODEL = "claude-sonnet-5";

export const DEFAULT_PROVIDER_BAKEOFF_MANIFEST = {
  goldenSetId: "r1-family-persona-story-golden-v1",
  fixturePolicy: {
    allowedSubjects: ["synthetic", "consenting-adult"],
    prohibitedSubjects: ["minor", "unrelated-personal-data"],
    statement:
      "Only synthetic subjects or documented consenting adults may enter this canary; no minor photos or unrelated personal data.",
  },
  flux2TrainingSteps: 300,
  flux2AutomaticEscalation: false,
  storyPageCount: 12,
} as const;

export type BakeoffProvider = "fal" | "anthropic";
export type ProviderEvidenceStatus = "succeeded" | "failed";

export interface ProviderEvidence {
  operationId: string;
  provider: BakeoffProvider;
  model: string;
  endpoint: string;
  status: ProviderEvidenceStatus;
  costUsd: number;
  latencyMs: number;
  providerRequestId: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderBakeoffOperation {
  operationId: string;
  provider: BakeoffProvider;
  kind: "training" | "generation" | "repair" | "story";
  model: string;
  endpoint: string;
  maxCostUsd: number;
  fixtureId: string;
  personaIds?: string[];
  trainingSteps?: number;
}

export interface ProviderBakeoffFalAdapter extends FalAdapter {
  runTraining(operation: ProviderBakeoffOperation): Promise<ProviderEvidence>;
  runGeneration(operation: ProviderBakeoffOperation): Promise<ProviderEvidence>;
  runRepair(operation: ProviderBakeoffOperation): Promise<ProviderEvidence>;
}

export interface ProviderBakeoffAnthropicAdapter extends AnthropicAdapter {
  runStoryGeneration(operation: ProviderBakeoffOperation): Promise<ProviderEvidence>;
}

export interface ProviderBakeoffAdapters {
  fal: ProviderBakeoffFalAdapter;
  anthropic: ProviderBakeoffAnthropicAdapter;
}

export interface ProviderBakeoffConfig {
  budgetUsd: number;
  liveRunApproved: true;
  credentials: {
    fal: string;
    anthropic: string;
  };
}

export interface ProviderBakeoffEnv {
  FAL_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LIVE_PROVIDER_BUDGET_USD?: string;
  LIVE_PROVIDER_RUN_APPROVED?: string;
}

export class ProviderBakeoffConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderBakeoffConfigError";
  }
}

export class ProviderBakeoffBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderBakeoffBudgetError";
  }
}

export interface ProviderBakeoffReport {
  schemaVersion: "176-provider-bakeoff/v1";
  ticket: 176;
  startedAt: string;
  completedAt: string;
  budget: {
    configuredUsd: number;
    approvedCeilingUsd: number;
    reservedUsd: number;
    costUsd: number;
    remainingUsd: number;
  };
  fixturePolicy: typeof DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixturePolicy;
  goldenSetId: string;
  evidence: ProviderEvidence[];
  totals: {
    costUsd: number;
    latencyMs: number;
    failedOperations: number;
  };
  stepEscalation: {
    automatic: false;
    attempted: number[];
  };
  qualityRubric: string;
  decision: {
    status: "blocked" | "recommendation";
    recommendation: string | null;
    rationale: string;
    missingEvidence: string[];
  };
  productionRoutingMutated: false;
}

export interface RunProviderBakeoffOptions {
  config: ProviderBakeoffConfig;
  adapters: ProviderBakeoffAdapters;
  estimatedCostUsdByOperation?: Partial<Record<string, number>>;
  now?: () => Date;
}

export const QUALITY_RUBRIC_TEMPLATE = `# Provider bake-off quality rubric — golden set ${DEFAULT_PROVIDER_BAKEOFF_MANIFEST.goldenSetId}

Score each candidate 1–5 and record reviewer notes for the same Brief/context input.

| Dimension | FLUX.1 LoRA | FLUX.2 LoRA V2 | Sonnet 4.6 | Sonnet 5 | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Likeness |  |  | n/a | n/a |  |
| Identity separation (single/two-Persona) |  |  | n/a | n/a |  |
| Prompt adherence |  |  |  |  |  |
| Style consistency across Pages |  |  |  |  |  |
| Warmth/read-aloud quality | n/a | n/a |  |  |  |
| Safety |  |  |  |  |  |
| Semantic 12-Page contract | n/a | n/a |  |  |  |
| Human preference |  |  |  |  |  |

A FLUX.2 production recommendation requires acceptable likeness at <=500 steps,
passing multi-Persona quality, selective repair evidence, and an actual-cost /
latency record. A Sonnet 5 recommendation requires a golden-set win without
regressing safety, semantic validity, latency, or cost.`;

const DEFAULT_OPERATION_COST_USD = {
  training: 0.08,
  generation: 0.03,
  repair: 0.06,
  story: 0.12,
} as const;

function requiredCredential(env: ProviderBakeoffEnv, name: keyof ProviderBakeoffEnv): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ProviderBakeoffConfigError(
      `Provider bake-off refuses to run: explicit ${name} is required`
    );
  }
  return value;
}

export function createProviderBakeoffConfig(
  env: ProviderBakeoffEnv = {
    FAL_API_KEY: process.env.FAL_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    LIVE_PROVIDER_BUDGET_USD: process.env.LIVE_PROVIDER_BUDGET_USD,
    LIVE_PROVIDER_RUN_APPROVED: process.env.LIVE_PROVIDER_RUN_APPROVED,
  }
): ProviderBakeoffConfig {
  const fal = requiredCredential(env, "FAL_API_KEY");
  const anthropic = requiredCredential(env, "ANTHROPIC_API_KEY");
  const rawBudget = env.LIVE_PROVIDER_BUDGET_USD?.trim();
  const budgetUsd = rawBudget === undefined ? Number.NaN : Number(rawBudget);

  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new ProviderBakeoffConfigError(
      "Provider bake-off refuses to run: LIVE_PROVIDER_BUDGET_USD must be positive"
    );
  }
  if (budgetUsd > APPROVED_PROVIDER_BAKEOFF_CEILING_USD) {
    throw new ProviderBakeoffConfigError(
      `LIVE_PROVIDER_BUDGET_USD exceeds the approved $${APPROVED_PROVIDER_BAKEOFF_CEILING_USD} ceiling`
    );
  }
  if (env.LIVE_PROVIDER_RUN_APPROVED !== "true") {
    throw new ProviderBakeoffConfigError(
      "Provider bake-off refuses to run: LIVE_PROVIDER_RUN_APPROVED=true is required"
    );
  }

  return { budgetUsd, liveRunApproved: true, credentials: { fal, anthropic } };
}

function operationPlan(): ProviderBakeoffOperation[] {
  const operations: ProviderBakeoffOperation[] = [];
  for (const model of ["flux-1-lora", "flux-2-lora-v2"]) {
    const endpoint = model === "flux-2-lora-v2" ? FLUX_2_TRAINER_ENDPOINT : "fal-ai/flux-lora-fast-training";
    for (const personaId of ["persona-a", "persona-b"]) {
      operations.push({
        operationId: `${model === "flux-2-lora-v2" ? "flux-2" : "flux-1"}-train-${personaId}`,
        provider: "fal",
        kind: "training",
        model,
        endpoint,
        maxCostUsd: DEFAULT_OPERATION_COST_USD.training,
        fixtureId: "synthetic-family-a",
        personaIds: [personaId],
        trainingSteps: model === "flux-2-lora-v2" ? DEFAULT_PROVIDER_BAKEOFF_MANIFEST.flux2TrainingSteps : 300,
      });
    }

    operations.push(
      {
        operationId: `${model === "flux-2-lora-v2" ? "flux-2" : "flux-1"}-single-persona-sample`,
        provider: "fal",
        kind: "generation",
        model,
        endpoint: model === "flux-2-lora-v2" ? FLUX_2_LORA_ENDPOINT : FLUX_1_LORA_ENDPOINT,
        maxCostUsd: DEFAULT_OPERATION_COST_USD.generation,
        fixtureId: "synthetic-family-a",
        personaIds: ["persona-a"],
      },
      {
        operationId: `${model === "flux-2-lora-v2" ? "flux-2" : "flux-1"}-two-persona-sample`,
        provider: "fal",
        kind: "generation",
        model,
        endpoint: model === "flux-2-lora-v2" ? FLUX_2_LORA_ENDPOINT : FLUX_1_LORA_ENDPOINT,
        maxCostUsd: DEFAULT_OPERATION_COST_USD.generation,
        fixtureId: "synthetic-family-a",
        personaIds: ["persona-a", "persona-b"],
      }
    );
  }

  operations.push({
    operationId: "selective-nano-banana-repair",
    provider: "fal",
    kind: "repair",
    model: "nano-banana-2-edit",
    endpoint: "fal-ai/nano-banana-2/edit",
    maxCostUsd: DEFAULT_OPERATION_COST_USD.repair,
    fixtureId: "synthetic-family-a",
    personaIds: ["persona-a", "persona-b"],
  });

  for (const model of [SONNET_4_6_MODEL, SONNET_5_MODEL]) {
    for (const goldenCase of ["bedtime-cast", "learning-moment", "two-persona-adventure"]) {
      operations.push({
        operationId: `${model}-${goldenCase}`,
        provider: "anthropic",
        kind: "story",
        model,
        endpoint: "anthropic.messages.create",
        maxCostUsd: DEFAULT_OPERATION_COST_USD.story,
        fixtureId: goldenCase,
      });
    }
  }
  return operations;
}

function assertEvidence(operation: ProviderBakeoffOperation, result: ProviderEvidence): ProviderEvidence {
  if (result.operationId !== operation.operationId) {
    throw new Error(`Provider evidence operation mismatch for ${operation.operationId}`);
  }
  if (result.provider !== operation.provider) {
    throw new Error(`Provider evidence provider mismatch for ${operation.operationId}`);
  }
  if (result.model !== operation.model) {
    throw new Error(`Provider evidence model mismatch for ${operation.operationId}`);
  }
  if (result.endpoint !== operation.endpoint) {
    throw new Error(`Provider evidence endpoint mismatch for ${operation.operationId}`);
  }
  if (!result.providerRequestId?.trim()) {
    throw new Error(`Provider evidence request id is missing for ${operation.operationId}`);
  }
  if (!Number.isFinite(result.costUsd) || result.costUsd < 0 || result.costUsd > operation.maxCostUsd) {
    throw new ProviderBakeoffBudgetError(
      `Provider evidence for ${operation.operationId} exceeded its reserved max cost`
    );
  }
  if (!Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
    throw new Error(`Provider evidence latency is invalid for ${operation.operationId}`);
  }
  return result;
}

async function executeOperation(
  operation: ProviderBakeoffOperation,
  adapters: ProviderBakeoffAdapters
): Promise<ProviderEvidence> {
  const started = Date.now();
  try {
    let result: ProviderEvidence;
    if (operation.provider === "anthropic") {
      result = await adapters.anthropic.runStoryGeneration(operation);
    } else if (operation.kind === "training") {
      result = await adapters.fal.runTraining(operation);
    } else if (operation.kind === "repair") {
      result = await adapters.fal.runRepair(operation);
    } else {
      result = await adapters.fal.runGeneration(operation);
    }
    return {
      ...assertEvidence(operation, result),
      metadata: {
        ...operation,
        ...(result.metadata ?? {}),
      },
    };
  } catch (error) {
    if (error instanceof ProviderBakeoffBudgetError) throw error;
    return {
      operationId: operation.operationId,
      provider: operation.provider,
      model: operation.model,
      endpoint: operation.endpoint,
      status: "failed",
      costUsd: 0,
      latencyMs: Math.max(0, Date.now() - started),
      providerRequestId: `${operation.operationId}:error`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runProviderBakeoff({
  config,
  adapters,
  estimatedCostUsdByOperation = {},
  now = () => new Date(),
}: RunProviderBakeoffOptions): Promise<ProviderBakeoffReport> {
  if (
    config.liveRunApproved !== true ||
    config.budgetUsd <= 0 ||
    config.budgetUsd > APPROVED_PROVIDER_BAKEOFF_CEILING_USD
  ) {
    throw new ProviderBakeoffConfigError("Invalid provider bake-off budget");
  }

  const startedAt = now().toISOString();
  const evidence: ProviderEvidence[] = [];
  let reservedUsd = 0;
  let costUsd = 0;

  for (const operation of operationPlan()) {
    const estimate = estimatedCostUsdByOperation[operation.operationId] ?? operation.maxCostUsd;
    if (!Number.isFinite(estimate) || estimate < 0 || estimate > operation.maxCostUsd) {
      throw new ProviderBakeoffConfigError(
        `Invalid reserved cost for ${operation.operationId}; it must be between $0 and $${operation.maxCostUsd}`
      );
    }
    if (reservedUsd + estimate > config.budgetUsd + Number.EPSILON) {
      throw new ProviderBakeoffBudgetError(
        `Provider bake-off hard stop before ${operation.operationId}: reserved $${(reservedUsd + estimate).toFixed(4)} would exceed configured budget $${config.budgetUsd.toFixed(4)}`
      );
    }

    reservedUsd += estimate;
    const result = await executeOperation({ ...operation, maxCostUsd: estimate }, adapters);
    evidence.push(result);
    costUsd += result.costUsd;
  }

  const completedAt = now().toISOString();
  const failedOperations = evidence.filter((item) => item.status === "failed").length;
  return {
    schemaVersion: "176-provider-bakeoff/v1",
    ticket: 176,
    startedAt,
    completedAt,
    budget: {
      configuredUsd: config.budgetUsd,
      approvedCeilingUsd: APPROVED_PROVIDER_BAKEOFF_CEILING_USD,
      reservedUsd,
      costUsd,
      remainingUsd: Math.max(0, config.budgetUsd - reservedUsd),
    },
    fixturePolicy: DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixturePolicy,
    goldenSetId: DEFAULT_PROVIDER_BAKEOFF_MANIFEST.goldenSetId,
    evidence,
    totals: {
      costUsd,
      latencyMs: evidence.reduce((sum, item) => sum + item.latencyMs, 0),
      failedOperations,
    },
    stepEscalation: {
      automatic: false,
      attempted: [],
    },
    qualityRubric: QUALITY_RUBRIC_TEMPLATE,
    decision: {
      status: "blocked",
      recommendation: null,
      rationale:
        "Deterministic adapter evidence is not release evidence; production routing remains unchanged until the fixed golden set is run with real providers and human rubric scores.",
      missingEvidence: [
        "real fal.ai FLUX.1 and fal-ai/flux-2-trainer-v2 responses",
        "real Anthropic Sonnet 4.6 and Sonnet 5 golden-set responses",
        "completed human quality rubric for likeness, identity separation, safety, and Story quality",
      ],
    },
    productionRoutingMutated: false,
  };
}

/**
 * Compile-time adapter seam helpers. The live command intentionally does not
 * construct providers here: paid adapters must be wired in a separately
 * reviewed live-run change, never inferred from environment credentials.
 */
export type ExistingFalAdapterContract = FalAdapter & {
  startTraining(photos: Buffer[]): Promise<FalTrainResult>;
  generateImage(prompt: string, loraKey: string, options?: { idempotencyKey?: string }): Promise<FalImageResult>;
};
