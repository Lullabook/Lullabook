import { describe, expect, it } from "vitest";
import {
  createProviderBakeoffConfig,
  runProviderBakeoff,
  type ProviderBakeoffAdapters,
  type ProviderBakeoffOperation,
  type ProviderEvidence,
} from "@/services/provider-bakeoff";

function config() {
  return createProviderBakeoffConfig({
    FAL_API_KEY: "credential",
    ANTHROPIC_API_KEY: "credential",
    LIVE_PROVIDER_BUDGET_USD: "10",
    LIVE_PROVIDER_RUN_APPROVED: "true",
  });
}

function adapters(
  source: ProviderEvidence["evidenceSource"],
  override: Partial<ProviderEvidence> = {},
): ProviderBakeoffAdapters {
  const run = async (operation: ProviderBakeoffOperation): Promise<ProviderEvidence> => ({
    operationId: operation.operationId,
    provider: operation.provider,
    model: operation.model,
    endpoint: operation.endpoint,
    status: "succeeded",
    costUsd: 0.01,
    actualCostUsd: 0.01,
    latencyMs: 10,
    providerRequestId: operation.provider === "anthropic"
      ? `msg_${operation.operationId}_1234567890`
      : `2f1064ec-${operation.operationId}-4c31-9fd5-123456789012`,
    evidenceSource: source,
    ...override,
  });
  return {
    fal: {
      startTraining: async () => ({ jobId: "unused", status: "queued" }),
      submitTraining: async () => ({ jobId: "unused", status: "queued" }),
      generateImage: async () => ({ imageUrl: "unused" }),
      inpaintFaces: async () => ({ imageUrl: "unused" }),
      generateWithReferenceModel: async () => ({ imageUrl: "unused" }),
      runTraining: run,
      runGeneration: run,
      runRepair: run,
    },
    anthropic: {
      generateStory: async () => { throw new Error("unused"); },
      generateTextStory: async () => ({ text: "unused" }),
      adaptStory: async () => { throw new Error("unused"); },
      generateCharacterDescription: async () => ({ description: "unused" }),
      runStoryGeneration: run,
    },
  };
}

const operation: ProviderBakeoffOperation = {
  operationId: "flux-1-train-persona-a",
  provider: "fal",
  kind: "training",
  model: "flux-1-lora",
  endpoint: "fal-ai/flux-lora-fast-training",
  maxCostUsd: 0.08,
  fixtureId: "synthetic-family-a",
};

describe("176 — canary evidence eligibility and redaction", () => {
  it("never promotes deterministic/development evidence to release eligibility", async () => {
    const report = await runProviderBakeoff({
      config: config(),
      adapters: adapters("development"),
      operations: [operation],
    });

    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.ineligibleEvidence).toEqual(
      expect.arrayContaining([expect.stringMatching(/development|real provider/i)]),
    );
  });

  it("allowlists report evidence and removes nested credentials, prompts, media, and tokenized URLs", async () => {
    const report = await runProviderBakeoff({
      config: config(),
      adapters: adapters("real-provider", {
        metadata: {
          authorization: "Bearer secret-token",
          prompt: "private prompt",
          photoBytes: "raw-child-photo",
          outputUrl: "https://v3.fal.media/result.png?token=secret",
        },
        outputUrl: "https://v3.fal.media/result.png?token=secret",
        contentType: "image/png",
      }),
      operations: [operation],
    });

    expect(report.releaseEvidenceEligible).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/secret-token|private prompt|raw-child-photo|token=secret|metadata/i);
    expect(report.evidence[0]).toMatchObject({
      evidenceSource: "real-provider",
      actualCostUsd: 0.01,
      contentType: "image/png",
      outputOrigin: "https://v3.fal.media",
    });
  });

  it("rejects untrusted output origins and copied provider request IDs", async () => {
    await expect(runProviderBakeoff({
      config: config(),
      adapters: adapters("real-provider", { outputUrl: "https://evil.example/result.png" }),
      operations: [operation],
    })).rejects.toThrow(/trusted.*origin|output.*origin/i);

    const duplicated = adapters("real-provider", { providerRequestId: "same-real-provider-request-123456" });
    const report = await runProviderBakeoff({
      config: config(),
      adapters: duplicated,
      operations: [operation, { ...operation, operationId: "flux-1-train-persona-b" }],
    });
    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.ineligibleEvidence).toEqual(
      expect.arrayContaining([expect.stringMatching(/duplicate|copied|request id/i)]),
    );
  });
});
