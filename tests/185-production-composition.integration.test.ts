import { describe, expect, it } from "vitest";

import {
  createR1ProviderE2EConfig,
  runR1ProviderE2E,
  type R1ProviderE2EAdapters,
  type R1ProviderE2EOperation,
} from "@/services/r1-provider-e2e";

const config = () => createR1ProviderE2EConfig({
  FAL_API_KEY: "test-fal-credential",
  ANTHROPIC_API_KEY: "test-anthropic-credential",
  LIVE_PROVIDER_BUDGET_USD: "2",
});

function productionLikeDeterministicAdapters(
  calls: R1ProviderE2EOperation[],
  failOperationId?: string,
): R1ProviderE2EAdapters {
  const run = async (operation: R1ProviderE2EOperation) => {
    calls.push(operation);
    if (operation.operationId === failOperationId) throw new Error("forced provider failure");
    return {
      requestId: `synthetic-${operation.operationId}-request`,
      provider: operation.provider,
      endpoint: operation.endpoint,
      model: operation.model,
      pricingVersion: operation.pricingVersion,
      status: "succeeded" as const,
      durationMs: 25,
      actualCostUsd: operation.maxCostUsd / 2,
      redactedLog: `${operation.operationId} completed`,
    };
  };
  return {
    // This deliberately uses the full operation contract, but its explicit
    // deterministic provenance prevents it from becoming live release evidence.
    liveAdaptersWired: true,
    fal: { available: true, evidenceSource: "deterministic", run },
    anthropic: { available: true, evidenceSource: "deterministic", run },
  };
}

describe("185 — production-like release-gate composition", () => {
  it("records the actually executed training, Story, and 12-Page stages while holding the incomplete fixture gate closed", async () => {
    const calls: R1ProviderE2EOperation[] = [];
    const report = await runR1ProviderE2E({
      config: config(),
      adapters: productionLikeDeterministicAdapters(calls),
    });

    expect(calls.map((operation) => operation.stageId)).toEqual([
      "train",
      "valid-story",
      "twelve-page-jobs",
    ]);
    expect(report.evidence).toHaveLength(3);
    expect(report.evidence.every((item) => item.evidenceSource === "deterministic")).toBe(true);
    expect(report.flowPlan.filter((item) => item.status === "passed").map((item) => item.id)).toEqual([
      "train",
      "valid-story",
      "twelve-page-jobs",
    ]);
    expect(report.flowChecklist).toMatchObject({ passed: 3, failed: 0, pending: 13 });
    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.status).toBe("blocked");
    expect(report.decision.missingEvidence).toEqual(expect.arrayContaining([
      expect.stringMatching(/13 required R1 flow stages remain unexecuted/i),
    ]));
  });

  it("records a forced Page failure as failed evidence without fabricating spend or a recoverable success", async () => {
    const calls: R1ProviderE2EOperation[] = [];
    const report = await runR1ProviderE2E({
      config: config(),
      adapters: productionLikeDeterministicAdapters(calls, "r1-page-fanout"),
    });

    expect(calls).toHaveLength(3);
    expect(report.flowPlan.find((item) => item.id === "twelve-page-jobs")?.status).toBe("failed");
    expect(report.evidence.find((item) => item.endpoint === "fal-ai/flux-2/lora")).toMatchObject({
      status: "failed",
      actualCostUsd: 0,
    });
    expect(report.releaseEvidenceEligible).toBe(false);
  });
});
