import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPROVED_PROVIDER_BAKEOFF_CEILING_USD,
  DEFAULT_PROVIDER_BAKEOFF_MANIFEST,
  ProviderBakeoffBudgetError,
  ProviderBakeoffConfigError,
  createProviderBakeoffConfig,
  runProviderBakeoff,
  type ProviderBakeoffAdapters,
  type ProviderEvidence,
} from "@/services/provider-bakeoff";

function evidence(
  operationId: string,
  overrides: Partial<ProviderEvidence> = {}
): ProviderEvidence {
  return {
    operationId,
    provider: "fal",
    model: "flux-1-lora",
    endpoint: "fal-ai/flux-lora",
    status: "succeeded",
    costUsd: 0.01,
    latencyMs: 20,
    providerRequestId: `fake-${operationId}`,
    ...overrides,
  };
}

function fakeAdapters(options: {
  costs?: Partial<Record<string, number>>;
  failures?: string[];
  calls?: string[];
} = {}): ProviderBakeoffAdapters {
  const calls = options.calls ?? [];
  const costs = options.costs ?? {};
  const failures = new Set(options.failures ?? []);
  const run = async (operation: {
    operationId: string;
    provider: "fal" | "anthropic";
    model: string;
    endpoint: string;
    maxCostUsd: number;
  }): Promise<ProviderEvidence> => {
    calls.push(operation.operationId);
    if (failures.has(operation.operationId)) {
      return evidence(operation.operationId, {
        provider: operation.provider,
        model: operation.model,
        endpoint: operation.endpoint,
        status: "failed",
        costUsd: 0,
        error: "simulated provider failure",
      });
    }
    return evidence(operation.operationId, {
      provider: operation.provider,
      model: operation.model,
      endpoint: operation.endpoint,
      costUsd: costs[operation.operationId] ?? 0.01,
    });
  };

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
      generateStory: async () => {
        throw new Error("unused");
      },
      generateTextStory: async () => ({ text: "unused" }),
      adaptStory: async () => {
        throw new Error("unused");
      },
      generateCharacterDescription: async () => ({ description: "unused" }),
      runStoryGeneration: run,
    },
  };
}

function config(budgetUsd = 10) {
  return createProviderBakeoffConfig({
    FAL_API_KEY: "fake-fal-credential",
    ANTHROPIC_API_KEY: "fake-anthropic-credential",
    LIVE_PROVIDER_BUDGET_USD: String(budgetUsd),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("176 — budget-gated provider bake-off contract", () => {
  it("refuses to run without explicit credentials", () => {
    expect(() =>
      createProviderBakeoffConfig({
        LIVE_PROVIDER_BUDGET_USD: "10",
        FAL_API_KEY: "",
        ANTHROPIC_API_KEY: "present",
      })
    ).toThrow(ProviderBakeoffConfigError);

    expect(() =>
      createProviderBakeoffConfig({
        LIVE_PROVIDER_BUDGET_USD: "10",
        FAL_API_KEY: "present",
        ANTHROPIC_API_KEY: undefined,
      })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("refuses to run without a positive budget and never accepts more than the approved ceiling", () => {
    expect(() =>
      createProviderBakeoffConfig({
        LIVE_PROVIDER_BUDGET_USD: "0",
        FAL_API_KEY: "present",
        ANTHROPIC_API_KEY: "present",
      })
    ).toThrow(ProviderBakeoffConfigError);

    expect(() => config(APPROVED_PROVIDER_BAKEOFF_CEILING_USD + 0.01)).toThrow(
      /approved.*ceiling|10/i
    );
  });

  it("hard-stops before an operation whose reserved cost would exceed the budget", async () => {
    const calls: string[] = [];
    const adapters = fakeAdapters({ calls });
    await expect(
      runProviderBakeoff({
        config: config(0.05),
        adapters,
        estimatedCostUsdByOperation: {
          "flux-1-train-persona-a": 0.04,
          "flux-1-train-persona-b": 0.02,
        },
      })
    ).rejects.toThrow(ProviderBakeoffBudgetError);
    expect(calls).toEqual(["flux-1-train-persona-a"]);
  });

  it("does not escalate a failed 300-step FLUX.2 run automatically", async () => {
    const calls: string[] = [];
    const report = await runProviderBakeoff({
      config: config(),
      adapters: fakeAdapters({
        calls,
        failures: ["flux-2-train-persona-a"],
      }),
    });

    expect(calls).toContain("flux-2-train-persona-a");
    expect(calls.some((id) => id.includes("flux-2") && id.includes("500"))).toBe(false);
    expect(calls.some((id) => id.includes("flux-2") && id.includes("1000"))).toBe(false);
    expect(report.stepEscalation).toEqual({ automatic: false, attempted: [] });
    expect(report.evidence.some((item) => item.operationId === "flux-2-train-persona-a" && item.status === "failed")).toBe(true);
  });

  it("declares a fixed synthetic/consenting-adult fixture policy", () => {
    expect(DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixturePolicy).toMatchObject({
      allowedSubjects: expect.arrayContaining(["synthetic", "consenting-adult"]),
      prohibitedSubjects: expect.arrayContaining(["minor", "unrelated-personal-data"]),
    });
    expect(DEFAULT_PROVIDER_BAKEOFF_MANIFEST.goldenSetId).toBeTruthy();
  });

  it("produces machine-readable evidence and a human quality rubric", async () => {
    const report = await runProviderBakeoff({
      config: config(),
      adapters: fakeAdapters(),
    });

    expect(report).toMatchObject({
      schemaVersion: "176-provider-bakeoff/v1",
      ticket: 176,
      budget: {
        configuredUsd: 10,
        approvedCeilingUsd: APPROVED_PROVIDER_BAKEOFF_CEILING_USD,
      },
      fixturePolicy: DEFAULT_PROVIDER_BAKEOFF_MANIFEST.fixturePolicy,
      goldenSetId: DEFAULT_PROVIDER_BAKEOFF_MANIFEST.goldenSetId,
      evidence: expect.any(Array),
      totals: {
        costUsd: expect.any(Number),
        latencyMs: expect.any(Number),
      },
      qualityRubric: expect.stringContaining("likeness"),
      decision: expect.objectContaining({
        status: "blocked",
        missingEvidence: expect.any(Array),
      }),
      productionRoutingMutated: false,
    });
    expect(report.evidence.every((item) =>
      ["provider", "model", "endpoint", "operationId", "status", "costUsd", "latencyMs", "providerRequestId"].every(
        (key) => key in item
      )
    )).toBe(true);
  });

  it("never mutates production routing while producing a recommendation or block", async () => {
    vi.stubEnv("PRODUCTION_ILLUSTRATION_MODEL", "fal-ai/flux-2/lora");
    vi.stubEnv("PRODUCTION_STORY_MODEL", "claude-sonnet-4-6");
    const before = {
      image: process.env.PRODUCTION_ILLUSTRATION_MODEL,
      story: process.env.PRODUCTION_STORY_MODEL,
    };

    const report = await runProviderBakeoff({
      config: config(),
      adapters: fakeAdapters(),
    });

    expect(report.productionRoutingMutated).toBe(false);
    expect(process.env.PRODUCTION_ILLUSTRATION_MODEL).toBe(before.image);
    expect(process.env.PRODUCTION_STORY_MODEL).toBe(before.story);
  });
});
