import { describe, expect, it } from "vitest";
import {
  InMemoryProviderBakeoffRepository,
  ProviderBakeoffUnreconciledError,
  createProviderBakeoffConfig,
  runProviderBakeoff,
  type ProviderBakeoffAdapters,
  type ProviderBakeoffRepository,
  type ProviderEvidence,
} from "@/services/provider-bakeoff";

function config(budgetUsd = 10) {
  return createProviderBakeoffConfig({
    FAL_API_KEY: "credential",
    ANTHROPIC_API_KEY: "credential",
    LIVE_PROVIDER_BUDGET_USD: String(budgetUsd),
    LIVE_PROVIDER_RUN_APPROVED: "true",
  });
}

function adapters(runTraining: ProviderBakeoffAdapters["fal"]["runTraining"]): ProviderBakeoffAdapters {
  const evidence = async (operation: Parameters<typeof runTraining>[0]): Promise<ProviderEvidence> => ({
    operationId: operation.operationId,
    provider: operation.provider,
    model: operation.model,
    endpoint: operation.endpoint,
    status: "succeeded",
    costUsd: 0.01,
    actualCostUsd: 0.01,
    latencyMs: 10,
    providerRequestId: `req_${operation.operationId}_1234567890`,
    evidenceSource: "real-provider",
  });
  return {
    fal: {
      startTraining: async () => ({ jobId: "unused", status: "queued" }),
      submitTraining: async () => ({ jobId: "unused", status: "queued" }),
      generateImage: async () => ({ imageUrl: "unused" }),
      inpaintFaces: async () => ({ imageUrl: "unused" }),
      generateWithReferenceModel: async () => ({ imageUrl: "unused" }),
      runTraining,
      runGeneration: evidence,
      runRepair: evidence,
    },
    anthropic: {
      generateStory: async () => { throw new Error("unused"); },
      generateTextStory: async () => ({ text: "unused" }),
      adaptStory: async () => { throw new Error("unused"); },
      generateCharacterDescription: async () => ({ description: "unused" }),
      runStoryGeneration: evidence,
    },
  };
}

describe("176 — crash-safe canary claims and budget reservations", () => {
  it("does not resubmit an operation whose billing became unknown across process restart", async () => {
    const repository = new InMemoryProviderBakeoffRepository();
    let submissions = 0;
    const paid = adapters(async () => {
      submissions++;
      throw new Error("connection lost after provider accepted the request");
    });

    const options = {
      config: config(),
      adapters: paid,
      repository,
      operations: [
        {
          operationId: "flux-1-train-persona-a",
          provider: "fal" as const,
          kind: "training" as const,
          model: "flux-1-lora",
          endpoint: "fal-ai/flux-lora-fast-training",
          maxCostUsd: 0.08,
          fixtureId: "synthetic-family-a",
          personaIds: ["persona-a"],
          trainingSteps: 300,
        },
      ],
    };

    await expect(runProviderBakeoff(options)).rejects.toThrow(ProviderBakeoffUnreconciledError);
    await expect(runProviderBakeoff(options)).rejects.toThrow(/unknown|unreconciled|accepted/i);
    expect(submissions).toBe(1);

    const state = repository.inspect();
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      status: "unknown_billing",
      reservedUsd: 0.08,
      actualCostUsd: null,
    });
    expect(state.runs[0]?.reservedUsd).toBe(0.08);
  });

  it("does not resubmit a durable claim after a crash before the adapter result is recorded", async () => {
    const durable = new InMemoryProviderBakeoffRepository();
    let crashAfterClaim = true;
    const repository: ProviderBakeoffRepository = {
      beginRun: (input) => durable.beginRun(input),
      claimOperation: async (runId, operation, reservedUsd) => {
        const claim = await durable.claimOperation(runId, operation, reservedUsd);
        if (crashAfterClaim) {
          crashAfterClaim = false;
          throw new Error("simulated process termination after durable claim");
        }
        return claim;
      },
      completeOperation: (runId, operationId, evidence) =>
        durable.completeOperation(runId, operationId, evidence),
      markUnknownBilling: (runId, operationId, error) =>
        durable.markUnknownBilling(runId, operationId, error),
      listOperations: (runId) => durable.listOperations(runId),
      completeRun: (runId, completedAt) => durable.completeRun(runId, completedAt),
    };
    let submissions = 0;
    const paid = adapters(async (operation) => {
      submissions++;
      return {
        operationId: operation.operationId,
        provider: operation.provider,
        model: operation.model,
        endpoint: operation.endpoint,
        status: "succeeded",
        costUsd: 0.01,
        actualCostUsd: 0.01,
        latencyMs: 10,
        providerRequestId: `req_${operation.operationId}_1234567890`,
        evidenceSource: "real-provider",
      };
    });
    const options = {
      config: config(),
      adapters: paid,
      repository,
      operations: [{
        operationId: "claimed-before-crash",
        provider: "fal" as const,
        kind: "training" as const,
        model: "flux-1-lora",
        endpoint: "fal-ai/flux-lora-fast-training",
        maxCostUsd: 0.08,
        fixtureId: "synthetic-family-a",
      }],
    };

    await expect(runProviderBakeoff(options)).rejects.toThrow(/process termination/i);
    await expect(runProviderBakeoff(options)).rejects.toThrow(/claim|unknown|resubmit/i);
    expect(submissions).toBe(0);
    expect(durable.inspect().operations[0]).toMatchObject({
      status: "claimed",
      reservedUsd: 0.08,
    });
  });

  it("reserves worst-case cost atomically before execution and never exceeds the configured budget", async () => {
    const repository = new InMemoryProviderBakeoffRepository();
    const calls: string[] = [];
    const paid = adapters(async (operation) => {
      calls.push(operation.operationId);
      return {
        operationId: operation.operationId,
        provider: operation.provider,
        model: operation.model,
        endpoint: operation.endpoint,
        status: "succeeded",
        costUsd: 0.04,
        actualCostUsd: 0.04,
        latencyMs: 10,
        providerRequestId: `req_${operation.operationId}_1234567890`,
        evidenceSource: "real-provider",
      };
    });

    await expect(runProviderBakeoff({
      config: config(0.05),
      adapters: paid,
      repository,
      operations: [
        {
          operationId: "one",
          provider: "fal",
          kind: "training",
          model: "flux-1-lora",
          endpoint: "fal-ai/flux-lora-fast-training",
          maxCostUsd: 0.04,
          fixtureId: "synthetic-family-a",
        },
        {
          operationId: "two",
          provider: "fal",
          kind: "training",
          model: "flux-1-lora",
          endpoint: "fal-ai/flux-lora-fast-training",
          maxCostUsd: 0.02,
          fixtureId: "synthetic-family-a",
        },
      ],
    })).rejects.toThrow(/budget/i);

    expect(calls).toEqual(["one"]);
    expect(repository.inspect().runs[0]?.reservedUsd).toBe(0.04);
  });
});
