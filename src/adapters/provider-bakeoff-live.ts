import { createHash } from "node:crypto";
import {
  RealAnthropicAdapter,
  SONNET_5_MODEL,
} from "@/adapters/anthropic";
import { RealFalAdapter } from "@/adapters/fal";
import type {
  FalGenerateImageOptions,
  FalPageImageRequest,
  FalPageRepairRequest,
  FalTrainingSubmission,
} from "@/adapters/types";
import type {
  ProviderBakeoffAdapters,
  ProviderBakeoffFixture,
  ProviderBakeoffOperation,
  ProviderEvidence,
} from "@/services/provider-bakeoff";

export interface LiveProviderBakeoffEnv {
  PROVIDER_BAKEOFF_LORA_KEYS_JSON?: string;
}

type LoraKeyMap = Record<string, string>;

function parseLoraKeys(value: string | undefined): LoraKeyMap {
  if (!value?.trim()) {
    throw new Error(
      "Provider bake-off refuses before network access: PROVIDER_BAKEOFF_LORA_KEYS_JSON is required",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PROVIDER_BAKEOFF_LORA_KEYS_JSON must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PROVIDER_BAKEOFF_LORA_KEYS_JSON must be an object");
  }
  const result: LoraKeyMap = {};
  for (const [key, path] of Object.entries(parsed)) {
    if (typeof path !== "string" || !path.trim()) {
      throw new Error(`Provider bake-off LoRA key ${key} is invalid`);
    }
    result[key] = path.trim();
  }
  for (const model of ["flux-1-lora", "flux-2-lora-v2"]) {
    for (const personaId of ["persona-a", "persona-b"]) {
      if (!result[`${model}:${personaId}`]) {
        throw new Error(
          `Provider bake-off refuses before network access: missing LoRA key ${model}:${personaId}`,
        );
      }
    }
  }
  return result;
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function estimatedEvidence(
  operation: ProviderBakeoffOperation,
  input: Omit<ProviderEvidence, "operationId" | "provider" | "model" | "endpoint" | "costUsd" | "actualCostUsd" | "latencyMs" | "evidenceSource"> & {
    latencyMs: number;
  },
): ProviderEvidence {
  return {
    operationId: operation.operationId,
    provider: operation.provider,
    model: operation.model,
    endpoint: operation.endpoint,
    status: input.status,
    costUsd: operation.maxCostUsd,
    actualCostUsd: null,
    latencyMs: input.latencyMs,
    providerRequestId: input.providerRequestId,
    evidenceSource: "real-provider",
    ...(input.error ? { error: input.error } : {}),
    ...(input.contentType ? { contentType: input.contentType } : {}),
    ...(input.outputUrl ? { outputUrl: input.outputUrl } : {}),
    ...(input.resultSha256 ? { resultSha256: input.resultSha256 } : {}),
    ...(input.story ? { story: input.story } : {}),
  };
}

/**
 * Paid-canary adapter composed from the same production fal and Anthropic
 * boundaries as the application. Provider billing is intentionally left null;
 * the report remains non-eligible until LUL-108 reconciliation records actual
 * cost rather than promoting a local estimate as a provider bill.
 */
export function createLiveProviderBakeoffAdapters(
  fixture: ProviderBakeoffFixture,
  env: LiveProviderBakeoffEnv = {
    PROVIDER_BAKEOFF_LORA_KEYS_JSON: process.env.PROVIDER_BAKEOFF_LORA_KEYS_JSON,
  },
): ProviderBakeoffAdapters {
  const loraKeys = parseLoraKeys(env.PROVIDER_BAKEOFF_LORA_KEYS_JSON);
  const fal = new RealFalAdapter();
  const generatedOutputUrls: string[] = [];

  const lorasFor = (operation: ProviderBakeoffOperation) =>
    (operation.personaIds ?? []).map((personaId) => ({
      personaId,
      path: loraKeys[`${operation.model}:${personaId}`]!,
      scale: 1,
    }));

  const pageRequest = (operation: ProviderBakeoffOperation): FalPageImageRequest => ({
    pageIndex: 0,
    prompt: `Provider bake-off golden-set image for ${operation.fixtureId}`,
    loras: lorasFor(operation),
    personaIds: operation.personaIds ?? [],
    styleBible: {
      palette: "warm bedtime watercolor",
      wardrobe: Object.fromEntries((operation.personaIds ?? []).map((id) => [id, "fixed canary outfit"])),
      artStyle: "warm children's picture-book watercolor",
    },
    seed: 176,
    seedMetadata: {
      storybookId: `canary-${operation.fixtureId}`,
      pageIndex: 0,
      algorithm: "storybook-page-seed-v1",
    },
    provider: "fal",
    model: operation.model,
    modelVersion: operation.model,
    endpoint: operation.endpoint,
    safety: { enabled: true },
    idempotencyKey: `provider-bakeoff:${fixture.manifest.manifestSha256}:${operation.operationId}`,
  });

  const runImage = async (operation: ProviderBakeoffOperation, repair: boolean) => {
    const startedAt = performance.now();
    const base = pageRequest(operation);
    const result = repair
      ? await fal.repairPageImage!({
          ...base,
          tier: "nano-banana-2-edit",
          referenceImageUrls: generatedOutputUrls.slice(-2),
        })
      : await fal.generatePageImage!(base);
    if (!result.providerRequestId) {
      throw new Error("Real fal adapter returned no queue request id");
    }
    generatedOutputUrls.push(result.imageUrl);
    return estimatedEvidence(operation, {
      status: "succeeded",
      latencyMs: elapsedMs(startedAt),
      providerRequestId: result.providerRequestId,
      outputUrl: result.imageUrl,
      contentType: result.contentType ?? "image/png",
      ...(result.bytes ? { resultSha256: digest(result.bytes) } : {}),
    });
  };

  return {
    fal: {
      isDevOnly: fal.isDevOnly,
      startTraining: (photos: Buffer[]) => fal.startTraining(photos),
      submitTraining: (input: FalTrainingSubmission) => fal.submitTraining(input),
      generateImage: (prompt: string, loraKey: string, options?: FalGenerateImageOptions) =>
        fal.generateImage(prompt, loraKey, options),
      generatePageImage: (input: FalPageImageRequest) => fal.generatePageImage(input),
      repairPageImage: (input: FalPageRepairRequest) => fal.repairPageImage(input),
      inpaintFaces: (baseImageUrl, faces) => fal.inpaintFaces(baseImageUrl, faces),
      generateWithReferenceModel: (prompt, referenceImageUrls) =>
        fal.generateWithReferenceModel(prompt, referenceImageUrls),
      runTraining: async (operation) => {
        const startedAt = performance.now();
        const result = await fal.submitTraining({
          imageDataUrl: `data:application/zip;base64,${fixture.archiveBytes.toString("base64")}`,
          defaultCaption: "synthetic consenting-adult provider bake-off subject",
          endpoint: operation.endpoint,
          model: operation.model,
          steps: operation.trainingSteps ?? 300,
          idempotencyKey: `provider-bakeoff:${fixture.manifest.manifestSha256}:${operation.operationId}`,
        });
        return estimatedEvidence(operation, {
          status: "succeeded",
          latencyMs: elapsedMs(startedAt),
          providerRequestId: result.jobId,
        });
      },
      runGeneration: (operation) => runImage(operation, false),
      runRepair: (operation) => runImage(operation, true),
    },
    anthropic: {
      generateStory: (input) => new RealAnthropicAdapter().generateStory(input),
      generateTextStory: (input) => new RealAnthropicAdapter().generateTextStory(input),
      adaptStory: (input) => new RealAnthropicAdapter().adaptStory(input),
      generateCharacterDescription: (input) =>
        new RealAnthropicAdapter().generateCharacterDescription(input),
      runStoryGeneration: async (operation) => {
        const adapter = new RealAnthropicAdapter({
          sonnet5GoldenSetWins: operation.model === SONNET_5_MODEL,
        });
        const startedAt = performance.now();
        const story = await adapter.generateStory({
          brief: `Golden-set canary case: ${operation.fixtureId}`,
          personaNames: operation.personaIds ?? [],
          pageCount: 12,
          storyType: "bedtime",
        });
        const evidence = adapter.lastGenerationEvidence;
        if (!evidence?.providerRequestId) {
          throw new Error("Real Anthropic adapter returned no message request id");
        }
        return estimatedEvidence(operation, {
          status: evidence.outcome === "success" ? "succeeded" : "failed",
          latencyMs: elapsedMs(startedAt),
          providerRequestId: evidence.providerRequestId,
          story,
          resultSha256: digest(Buffer.from(JSON.stringify(story))),
          ...(evidence.error ? { error: evidence.error } : {}),
        });
      },
    },
  };
}
