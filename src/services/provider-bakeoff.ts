import { createHash } from "node:crypto";
import {
  SONNET_4_6_MODEL,
  SONNET_5_MODEL,
  validateGeneratedStoryContract,
} from "@/adapters/anthropic";
import {
  FAL_FLUX_1_LORA_ENDPOINT,
  FAL_FLUX_1_TRAIN_ENDPOINT,
  FAL_FLUX_2_LORA_ENDPOINT,
  FAL_FLUX_2_TRAINER_ENDPOINT,
  FAL_NANO_BANANA_2_EDIT_ENDPOINT,
} from "@/adapters/fal";
import type { AnthropicAdapter, FalAdapter, FalImageResult, FalTrainResult } from "@/adapters/types";
import type { GeneratedStory } from "@/domain/types";

export const APPROVED_PROVIDER_BAKEOFF_CEILING_USD = 10;
export const FLUX_2_TRAINER_ENDPOINT = FAL_FLUX_2_TRAINER_ENDPOINT;
export const FLUX_2_LORA_ENDPOINT = FAL_FLUX_2_LORA_ENDPOINT;
export const FLUX_1_LORA_ENDPOINT = FAL_FLUX_1_LORA_ENDPOINT;
export { SONNET_4_6_MODEL, SONNET_5_MODEL };

const DEFAULT_ARCHIVE_BYTES = Buffer.from("lullabook-provider-bakeoff-synthetic-archive-v1\n");
const DEFAULT_GOLDEN_SET_BYTES = Buffer.from(
  '{"cases":["bedtime-cast","learning-moment","two-persona-adventure"],"version":1}\n',
);

export type ProviderBakeoffSubjectClassification =
  | "synthetic"
  | "consenting-adult"
  | "minor"
  | "unrelated-personal-data";

export interface ProviderBakeoffConsentProof {
  receiptId: string;
  subjectFingerprintSha256: string;
  noticeVersion: string;
  method: string;
  verifiedAt: string;
  revokedAt: string | null;
}

export interface ProviderBakeoffFixtureManifestInput {
  goldenSetId: string;
  archiveSha256: string;
  goldenSetSha256: string;
  subjectClassification: ProviderBakeoffSubjectClassification;
  consentProof: ProviderBakeoffConsentProof | null;
}

export interface ProviderBakeoffFixtureManifest extends ProviderBakeoffFixtureManifestInput {
  schemaVersion: "176-provider-fixture/v1";
  manifestSha256: string;
}

export interface ProviderBakeoffFixture {
  manifest: ProviderBakeoffFixtureManifest;
  archiveBytes: Buffer;
  goldenSetBytes: Buffer;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalManifestValue(input: ProviderBakeoffFixtureManifestInput) {
  return {
    schemaVersion: "176-provider-fixture/v1" as const,
    goldenSetId: input.goldenSetId,
    archiveSha256: input.archiveSha256,
    goldenSetSha256: input.goldenSetSha256,
    subjectClassification: input.subjectClassification,
    consentProof: input.consentProof
      ? {
          receiptId: input.consentProof.receiptId,
          subjectFingerprintSha256: input.consentProof.subjectFingerprintSha256,
          noticeVersion: input.consentProof.noticeVersion,
          method: input.consentProof.method,
          verifiedAt: input.consentProof.verifiedAt,
          revokedAt: input.consentProof.revokedAt,
        }
      : null,
  };
}

export function createProviderBakeoffFixtureManifest(
  input: ProviderBakeoffFixtureManifestInput,
): ProviderBakeoffFixtureManifest {
  const value = canonicalManifestValue(input);
  return {
    ...value,
    manifestSha256: sha256(JSON.stringify(value)),
  };
}

const DEFAULT_FIXTURE_MANIFEST = createProviderBakeoffFixtureManifest({
  goldenSetId: "r1-family-persona-story-golden-v1",
  archiveSha256: "8ed661959590388124563e95fbe4189f5b68c8068bc1667cb9dbe00ba5aa7977",
  goldenSetSha256: "2850641c33f51df579eed5f477c04a1afa2b51c3a97e691b46d829674a34e4c9",
  subjectClassification: "synthetic",
  consentProof: null,
});

export const DEFAULT_PROVIDER_BAKEOFF_FIXTURE: ProviderBakeoffFixture = {
  manifest: DEFAULT_FIXTURE_MANIFEST,
  archiveBytes: DEFAULT_ARCHIVE_BYTES,
  goldenSetBytes: DEFAULT_GOLDEN_SET_BYTES,
};

export const DEFAULT_PROVIDER_BAKEOFF_MANIFEST = {
  goldenSetId: DEFAULT_FIXTURE_MANIFEST.goldenSetId,
  fixtureManifestSha256: DEFAULT_FIXTURE_MANIFEST.manifestSha256,
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

export function validateProviderBakeoffFixture(
  fixture: ProviderBakeoffFixture,
  approvedManifestSha256 = DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixtureManifestSha256,
): ProviderBakeoffFixtureManifest {
  const manifestValue = canonicalManifestValue(fixture.manifest);
  const manifestSha256 = sha256(JSON.stringify(manifestValue));
  if (fixture.manifest.manifestSha256 !== manifestSha256) {
    throw new ProviderBakeoffConfigError("Provider fixture manifest digest does not match its contents");
  }
  if (manifestSha256 !== approvedManifestSha256) {
    throw new ProviderBakeoffConfigError("Provider fixture manifest is not the approved canary manifest");
  }
  if (sha256(fixture.archiveBytes) !== fixture.manifest.archiveSha256) {
    throw new ProviderBakeoffConfigError("Provider fixture archive SHA-256 digest mismatch");
  }
  if (sha256(fixture.goldenSetBytes) !== fixture.manifest.goldenSetSha256) {
    throw new ProviderBakeoffConfigError("Provider Story golden-set SHA-256 digest mismatch");
  }
  if (
    fixture.manifest.subjectClassification === "minor" ||
    fixture.manifest.subjectClassification === "unrelated-personal-data"
  ) {
    throw new ProviderBakeoffConfigError(
      `Provider fixture subject classification ${fixture.manifest.subjectClassification} is prohibited`,
    );
  }
  if (fixture.manifest.subjectClassification === "consenting-adult") {
    const proof = fixture.manifest.consentProof;
    if (
      !proof?.receiptId?.trim() ||
      !/^[a-f0-9]{64}$/i.test(proof.subjectFingerprintSha256) ||
      !proof.noticeVersion?.trim() ||
      !proof.method?.trim() ||
      !proof.verifiedAt?.trim() ||
      proof.revokedAt !== null
    ) {
      throw new ProviderBakeoffConfigError(
        "A consenting-adult fixture requires a durable verified, non-revoked consent proof",
      );
    }
  }
  return fixture.manifest;
}

export type BakeoffProvider = "fal" | "anthropic";
export type ProviderEvidenceStatus = "succeeded" | "failed";
export type ProviderEvidenceSource = "real-provider" | "development" | "deterministic";

export interface ProviderEvidence {
  operationId: string;
  provider: BakeoffProvider;
  model: string;
  endpoint: string;
  status: ProviderEvidenceStatus;
  costUsd: number;
  actualCostUsd?: number | null;
  latencyMs: number;
  providerRequestId: string;
  evidenceSource?: ProviderEvidenceSource;
  billingStatus?: "actual" | "unknown";
  error?: string;
  contentType?: string;
  outputOrigin?: string;
  resultSha256?: string;
  storyContractValidated?: boolean;
  /** Transient adapter fields. These are validated and never copied into the report. */
  outputUrl?: string;
  story?: GeneratedStory;
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

/** The provider may have accepted spend, but no auditable receipt was returned. */
export class ProviderBakeoffUnreconciledError extends Error {
  constructor(operationId: string, cause: unknown) {
    super(`Provider bake-off stopped after ${operationId}: ${redactProviderError(cause)}`);
    this.name = "ProviderBakeoffUnreconciledError";
  }
}

export type ProviderBakeoffOperationState =
  | "claimed"
  | "succeeded"
  | "failed"
  | "unknown_billing";

export interface ProviderBakeoffRunRecord {
  runId: string;
  fixtureManifestSha256: string;
  budgetUsd: number;
  reservedUsd: number;
  actualCostUsd: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface ProviderBakeoffOperationRecord {
  runId: string;
  operationId: string;
  status: ProviderBakeoffOperationState;
  reservedUsd: number;
  actualCostUsd: number | null;
  /** True only for the process that atomically created this pre-spend claim. */
  claimedNow?: boolean;
  evidence?: ProviderEvidence;
  error?: string;
}

export interface ProviderBakeoffRepository {
  beginRun(input: Omit<ProviderBakeoffRunRecord, "reservedUsd" | "actualCostUsd">): Promise<ProviderBakeoffRunRecord>;
  claimOperation(
    runId: string,
    operation: ProviderBakeoffOperation,
    reservedUsd: number,
  ): Promise<ProviderBakeoffOperationRecord>;
  completeOperation(
    runId: string,
    operationId: string,
    evidence: ProviderEvidence,
  ): Promise<ProviderBakeoffOperationRecord>;
  markUnknownBilling(runId: string, operationId: string, error: string): Promise<void>;
  listOperations(runId: string): Promise<ProviderBakeoffOperationRecord[]>;
  completeRun(runId: string, completedAt: Date): Promise<void>;
}

export class InMemoryProviderBakeoffRepository implements ProviderBakeoffRepository {
  private readonly runs = new Map<string, ProviderBakeoffRunRecord>();
  private readonly operations = new Map<string, ProviderBakeoffOperationRecord>();

  async beginRun(
    input: Omit<ProviderBakeoffRunRecord, "reservedUsd" | "actualCostUsd">,
  ): Promise<ProviderBakeoffRunRecord> {
    const existing = this.runs.get(input.runId);
    if (existing) {
      if (
        existing.fixtureManifestSha256 !== input.fixtureManifestSha256 ||
        existing.budgetUsd !== input.budgetUsd
      ) {
        throw new ProviderBakeoffConfigError("A resumed canary run must use the same fixture and budget");
      }
      return existing;
    }
    const run: ProviderBakeoffRunRecord = { ...input, reservedUsd: 0, actualCostUsd: 0 };
    this.runs.set(run.runId, run);
    return run;
  }

  async claimOperation(
    runId: string,
    operation: ProviderBakeoffOperation,
    reservedUsd: number,
  ): Promise<ProviderBakeoffOperationRecord> {
    const key = `${runId}:${operation.operationId}`;
    const existing = this.operations.get(key);
    if (existing) return { ...existing, claimedNow: false };
    const run = this.runs.get(runId);
    if (!run) throw new Error("Provider bake-off run is missing");
    if (run.reservedUsd + reservedUsd > run.budgetUsd + Number.EPSILON) {
      throw new ProviderBakeoffBudgetError(
        `Provider bake-off hard stop before ${operation.operationId}: reserved $${(run.reservedUsd + reservedUsd).toFixed(4)} would exceed configured budget $${run.budgetUsd.toFixed(4)}`,
      );
    }
    const record: ProviderBakeoffOperationRecord = {
      runId,
      operationId: operation.operationId,
      status: "claimed",
      reservedUsd,
      actualCostUsd: null,
      claimedNow: true,
    };
    run.reservedUsd += reservedUsd;
    this.runs.set(runId, run);
    this.operations.set(key, record);
    return record;
  }

  async completeOperation(
    runId: string,
    operationId: string,
    evidence: ProviderEvidence,
  ): Promise<ProviderBakeoffOperationRecord> {
    const key = `${runId}:${operationId}`;
    const record = this.operations.get(key);
    const run = this.runs.get(runId);
    if (!record || !run) throw new Error("Provider bake-off operation claim is missing");
    record.status = evidence.status;
    record.actualCostUsd = evidence.actualCostUsd ?? null;
    record.evidence = evidence;
    record.error = evidence.error;
    run.actualCostUsd = [...this.operations.values()]
      .filter((item) => item.runId === runId && item.operationId !== operationId)
      .reduce((sum, item) => sum + (item.actualCostUsd ?? 0), evidence.actualCostUsd ?? 0);
    this.operations.set(key, record);
    this.runs.set(runId, run);
    return record;
  }

  async markUnknownBilling(runId: string, operationId: string, error: string): Promise<void> {
    const key = `${runId}:${operationId}`;
    const record = this.operations.get(key);
    if (!record) throw new Error("Provider bake-off operation claim is missing");
    record.status = "unknown_billing";
    record.actualCostUsd = null;
    record.error = redactProviderError(error);
    this.operations.set(key, record);
  }

  async listOperations(runId: string): Promise<ProviderBakeoffOperationRecord[]> {
    return [...this.operations.values()].filter((record) => record.runId === runId);
  }

  async completeRun(runId: string, completedAt: Date): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Provider bake-off run is missing");
    run.completedAt = completedAt;
    this.runs.set(runId, run);
  }

  inspect(): { runs: ProviderBakeoffRunRecord[]; operations: ProviderBakeoffOperationRecord[] } {
    return { runs: [...this.runs.values()], operations: [...this.operations.values()] };
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
  fixtureManifestSha256: string;
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
  releaseEvidenceEligible: boolean;
  decision: {
    status: "blocked" | "recommendation";
    recommendation: string | null;
    rationale: string;
    missingEvidence: string[];
    ineligibleEvidence: string[];
  };
  productionRoutingMutated: false;
}

export interface RunProviderBakeoffOptions {
  config: ProviderBakeoffConfig;
  adapters: ProviderBakeoffAdapters;
  fixture?: ProviderBakeoffFixture;
  approvedManifestSha256?: string;
  repository?: ProviderBakeoffRepository;
  operations?: ProviderBakeoffOperation[];
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
      `Provider bake-off refuses to run: explicit ${name} is required`,
    );
  }
  return value;
}

function redactProviderError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]")
    .slice(0, 500);
}

export function createProviderBakeoffConfig(
  env: ProviderBakeoffEnv = {
    FAL_API_KEY: process.env.FAL_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    LIVE_PROVIDER_BUDGET_USD: process.env.LIVE_PROVIDER_BUDGET_USD,
    LIVE_PROVIDER_RUN_APPROVED: process.env.LIVE_PROVIDER_RUN_APPROVED,
  },
): ProviderBakeoffConfig {
  const fal = requiredCredential(env, "FAL_API_KEY");
  const anthropic = requiredCredential(env, "ANTHROPIC_API_KEY");
  const rawBudget = env.LIVE_PROVIDER_BUDGET_USD?.trim();
  const budgetUsd = rawBudget === undefined ? Number.NaN : Number(rawBudget);

  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new ProviderBakeoffConfigError(
      "Provider bake-off refuses to run: LIVE_PROVIDER_BUDGET_USD must be positive",
    );
  }
  if (budgetUsd > APPROVED_PROVIDER_BAKEOFF_CEILING_USD) {
    throw new ProviderBakeoffConfigError(
      `LIVE_PROVIDER_BUDGET_USD exceeds the approved $${APPROVED_PROVIDER_BAKEOFF_CEILING_USD} ceiling`,
    );
  }
  if (env.LIVE_PROVIDER_RUN_APPROVED !== "true") {
    throw new ProviderBakeoffConfigError(
      "Provider bake-off refuses to run: LIVE_PROVIDER_RUN_APPROVED=true is required",
    );
  }

  return { budgetUsd, liveRunApproved: true, credentials: { fal, anthropic } };
}

function operationPlan(): ProviderBakeoffOperation[] {
  const operations: ProviderBakeoffOperation[] = [];
  for (const model of ["flux-1-lora", "flux-2-lora-v2"]) {
    const endpoint = model === "flux-2-lora-v2"
      ? FAL_FLUX_2_TRAINER_ENDPOINT
      : FAL_FLUX_1_TRAIN_ENDPOINT;
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
        trainingSteps: model === "flux-2-lora-v2"
          ? DEFAULT_PROVIDER_BAKEOFF_MANIFEST.flux2TrainingSteps
          : 300,
      });
    }

    operations.push(
      {
        operationId: `${model === "flux-2-lora-v2" ? "flux-2" : "flux-1"}-single-persona-sample`,
        provider: "fal",
        kind: "generation",
        model,
        endpoint: model === "flux-2-lora-v2"
          ? FAL_FLUX_2_LORA_ENDPOINT
          : FAL_FLUX_1_LORA_ENDPOINT,
        maxCostUsd: DEFAULT_OPERATION_COST_USD.generation,
        fixtureId: "synthetic-family-a",
        personaIds: ["persona-a"],
      },
      {
        operationId: `${model === "flux-2-lora-v2" ? "flux-2" : "flux-1"}-two-persona-sample`,
        provider: "fal",
        kind: "generation",
        model,
        endpoint: model === "flux-2-lora-v2"
          ? FAL_FLUX_2_LORA_ENDPOINT
          : FAL_FLUX_1_LORA_ENDPOINT,
        maxCostUsd: DEFAULT_OPERATION_COST_USD.generation,
        fixtureId: "synthetic-family-a",
        personaIds: ["persona-a", "persona-b"],
      },
    );
  }

  operations.push({
    operationId: "selective-nano-banana-repair",
    provider: "fal",
    kind: "repair",
    model: "nano-banana-2-edit",
    endpoint: FAL_NANO_BANANA_2_EDIT_ENDPOINT,
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
        personaIds: goldenCase === "two-persona-adventure" ? ["persona-a", "persona-b"] : ["persona-a"],
      });
    }
  }
  return operations;
}

function trustedOutputOrigin(provider: BakeoffProvider, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Provider output origin is malformed");
  }
  const trusted = provider === "fal" && (
    url.hostname === "queue.fal.run" ||
    url.hostname === "fal.media" ||
    url.hostname.endsWith(".fal.media")
  );
  if (!trusted) throw new Error("Provider output did not use a trusted output origin");
  return url.origin;
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
      `Provider evidence for ${operation.operationId} exceeded its reserved max cost`,
    );
  }
  if (
    result.actualCostUsd !== undefined &&
    result.actualCostUsd !== null &&
    (!Number.isFinite(result.actualCostUsd) || result.actualCostUsd < 0 || result.actualCostUsd > operation.maxCostUsd)
  ) {
    throw new ProviderBakeoffBudgetError(
      `Provider actual cost for ${operation.operationId} exceeded its reserved max cost`,
    );
  }
  if (!Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
    throw new Error(`Provider evidence latency is invalid for ${operation.operationId}`);
  }

  let storyContractValidated: boolean | undefined;
  if (operation.kind === "story" && result.story) {
    validateGeneratedStoryContract(
      result.story,
      DEFAULT_PROVIDER_BAKEOFF_MANIFEST.storyPageCount,
      operation.personaIds ?? [],
    );
    storyContractValidated = true;
  }

  const outputOrigin = result.outputUrl
    ? trustedOutputOrigin(operation.provider, result.outputUrl)
    : undefined;
  return {
    operationId: result.operationId,
    provider: result.provider,
    model: result.model,
    endpoint: result.endpoint,
    status: result.status,
    costUsd: result.costUsd,
    actualCostUsd: result.actualCostUsd ?? null,
    latencyMs: result.latencyMs,
    providerRequestId: result.providerRequestId.trim(),
    evidenceSource: result.evidenceSource ?? "deterministic",
    billingStatus: result.actualCostUsd === null || result.actualCostUsd === undefined ? "unknown" : "actual",
    ...(result.error ? { error: redactProviderError(result.error) } : {}),
    ...(result.contentType ? { contentType: result.contentType.slice(0, 100) } : {}),
    ...(outputOrigin ? { outputOrigin } : {}),
    ...(result.resultSha256 && /^[a-f0-9]{64}$/i.test(result.resultSha256)
      ? { resultSha256: result.resultSha256 }
      : {}),
    ...(storyContractValidated === true ? { storyContractValidated: true } : {}),
  };
}

async function executeOperation(
  operation: ProviderBakeoffOperation,
  adapters: ProviderBakeoffAdapters,
): Promise<ProviderEvidence> {
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
  return assertEvidence(operation, result);
}

function requestIdLooksReal(evidence: ProviderEvidence): boolean {
  const id = evidence.providerRequestId.trim();
  return id.length >= 12 &&
    !/^(fake|test|mock|dev|deterministic|synthetic)[-_:]/i.test(id) &&
    id !== evidence.operationId;
}

function evidenceEligibility(evidence: ProviderEvidence[]): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    if (item.status !== "succeeded") reasons.push(`${item.operationId}: provider operation did not succeed`);
    if (item.evidenceSource !== "real-provider") {
      reasons.push(`${item.operationId}: development/deterministic evidence is not real provider evidence`);
    }
    if (item.actualCostUsd === null || item.actualCostUsd === undefined || item.billingStatus !== "actual") {
      reasons.push(`${item.operationId}: actual provider billing is unknown`);
    }
    if (!requestIdLooksReal(item)) reasons.push(`${item.operationId}: provider request id is fake or synthetic`);
    if (seen.has(item.providerRequestId)) reasons.push(`${item.operationId}: duplicate/copied provider request id`);
    seen.add(item.providerRequestId);
    if (item.provider === "anthropic" && item.storyContractValidated !== true) {
      reasons.push(`${item.operationId}: exact 12-Page Story contract was not validated`);
    }
  }
  return [...new Set(reasons)];
}

function runIdFor(manifest: ProviderBakeoffFixtureManifest, budgetUsd: number): string {
  return sha256(`176-provider-bakeoff/v1:${manifest.manifestSha256}:${budgetUsd.toFixed(4)}`);
}

export async function runProviderBakeoff({
  config,
  adapters,
  fixture = DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
  approvedManifestSha256,
  repository = new InMemoryProviderBakeoffRepository(),
  operations = operationPlan(),
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

  const manifest = validateProviderBakeoffFixture(
    fixture,
    approvedManifestSha256 ?? DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixtureManifestSha256,
  );
  const started = now();
  const runId = runIdFor(manifest, config.budgetUsd);
  const run = await repository.beginRun({
    runId,
    fixtureManifestSha256: manifest.manifestSha256,
    budgetUsd: config.budgetUsd,
    startedAt: started,
  });
  const evidence: ProviderEvidence[] = [];

  for (const operation of operations) {
    const estimate = estimatedCostUsdByOperation[operation.operationId] ?? operation.maxCostUsd;
    if (!Number.isFinite(estimate) || estimate <= 0 || estimate > operation.maxCostUsd) {
      throw new ProviderBakeoffConfigError(
        `Invalid reserved cost for ${operation.operationId}; it must be greater than $0 and at most $${operation.maxCostUsd}`,
      );
    }

    const claim = await repository.claimOperation(runId, operation, estimate);
    if (claim.status === "unknown_billing" || claim.status === "claimed") {
      if (claim.evidence) {
        evidence.push(claim.evidence);
        continue;
      }
      if (claim.status === "unknown_billing" || claim.claimedNow !== true) {
        throw new ProviderBakeoffUnreconciledError(
          operation.operationId,
          claim.error ?? "an existing pre-spend claim has unknown submission/billing state and cannot be resubmitted",
        );
      }
    }
    if ((claim.status === "succeeded" || claim.status === "failed") && claim.evidence) {
      evidence.push(claim.evidence);
      continue;
    }

    try {
      const result = await executeOperation({ ...operation, maxCostUsd: estimate }, adapters);
      const completed = await repository.completeOperation(runId, operation.operationId, result);
      if (!completed.evidence) throw new Error("Provider evidence was not durably recorded");
      evidence.push(completed.evidence);
    } catch (error) {
      if (error instanceof ProviderBakeoffBudgetError) throw error;
      await repository.markUnknownBilling(runId, operation.operationId, redactProviderError(error));
      throw new ProviderBakeoffUnreconciledError(operation.operationId, error);
    }
  }

  const completed = now();
  await repository.completeRun(runId, completed);
  const persistedOperations = await repository.listOperations(runId);
  const reservedUsd = persistedOperations.reduce((sum, item) => sum + item.reservedUsd, 0);
  const costUsd = evidence.reduce((sum, item) => sum + item.costUsd, 0);
  const failedOperations = evidence.filter((item) => item.status === "failed").length;
  const ineligibleEvidence = evidenceEligibility(evidence);
  const releaseEvidenceEligible = evidence.length > 0 && ineligibleEvidence.length === 0;

  return {
    schemaVersion: "176-provider-bakeoff/v1",
    ticket: 176,
    startedAt: run.startedAt.toISOString(),
    completedAt: completed.toISOString(),
    budget: {
      configuredUsd: config.budgetUsd,
      approvedCeilingUsd: APPROVED_PROVIDER_BAKEOFF_CEILING_USD,
      reservedUsd,
      costUsd,
      remainingUsd: Math.max(0, config.budgetUsd - reservedUsd),
    },
    fixturePolicy: DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixturePolicy,
    fixtureManifestSha256: manifest.manifestSha256,
    goldenSetId: manifest.goldenSetId,
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
    releaseEvidenceEligible,
    decision: {
      status: "blocked",
      recommendation: null,
      rationale: releaseEvidenceEligible
        ? "Provider evidence is eligible for human scoring; production routing remains unchanged until the completed rubric records an approved model decision."
        : "Provider evidence is not release-eligible; production routing remains unchanged until every durable trust, billing, and provenance check passes.",
      missingEvidence: releaseEvidenceEligible
        ? ["completed human quality rubric for likeness, identity separation, safety, and Story quality"]
        : [
            "eligible real fal.ai and Anthropic provider responses",
            "reconciled actual cost and latency evidence",
            "completed human quality rubric for likeness, identity separation, safety, and Story quality",
          ],
      ineligibleEvidence,
    },
    productionRoutingMutated: false,
  };
}

export type ExistingFalAdapterContract = FalAdapter & {
  startTraining(photos: Buffer[]): Promise<FalTrainResult>;
  generateImage(
    prompt: string,
    loraKey: string,
    options?: { idempotencyKey?: string },
  ): Promise<FalImageResult>;
};
