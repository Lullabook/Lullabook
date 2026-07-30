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

function adapters(source: "real-provider" | "deterministic", log: string, omitRequestId = false): R1ProviderE2EAdapters {
  const run = async (operation: R1ProviderE2EOperation) => ({
    ...(omitRequestId ? {} : { requestId: `provider-${operation.operationId}-123456` }),
    provider: operation.provider,
    endpoint: operation.endpoint,
    model: operation.model,
    pricingVersion: operation.pricingVersion,
    status: "succeeded" as const,
    durationMs: 18,
    actualCostUsd: operation.maxCostUsd / 2,
    redactedLog: log,
  });
  return {
    liveAdaptersWired: true,
    fal: { available: true, evidenceSource: source, run },
    anthropic: { available: true, evidenceSource: source, run },
  };
}

describe("185 — release evidence redaction", () => {
  it("redacts nested JSON credentials, prompts, photo fields, and provider URLs from every report path", async () => {
    const secretLog = JSON.stringify({
      authorization: "Bearer TOPSECRET",
      nested: {
        apiKey: "ANOTHERSECRET",
        prompt: "private story prompt",
        photoBytes: "private-child-media",
        providerUrl: "https://v3.fal.media/output.png?token=private-token",
      },
    });
    const report = await runR1ProviderE2E({
      config: config(),
      adapters: adapters("real-provider", secretLog),
    });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toMatch(/TOPSECRET|ANOTHERSECRET|private story prompt|private-child-media|private-token|v3\.fal\.media/i);
    expect(report.redactedLogs.every((line) => line.includes("[REDACTED]"))).toBe(true);
    // Three provider results are insufficient for the whole accepted R1 flow.
    expect(report.releaseEvidenceEligible).toBe(false);
  });

  it("rejects missing request IDs and explicit deterministic evidence even when other provider fields are plausible", async () => {
    const missingId = await runR1ProviderE2E({
      config: config(),
      adapters: adapters("real-provider", "complete", true),
    });
    expect(missingId.evidence.every((item) => item.status === "failed")).toBe(true);
    expect(missingId.releaseEvidenceEligible).toBe(false);

    const deterministic = await runR1ProviderE2E({
      config: config(),
      adapters: adapters("deterministic", "complete"),
    });
    expect(deterministic.evidence.every((item) => item.evidenceSource === "deterministic")).toBe(true);
    expect(deterministic.releaseEvidenceEligible).toBe(false);
  });
});
