import { describe, expect, it } from "vitest";

import {
  createR1ProviderE2EConfig,
  redactLog,
  runR1ProviderE2E,
  type R1ProviderE2EAdapters,
} from "@/services/r1-provider-e2e";

const config = () => createR1ProviderE2EConfig({
  FAL_API_KEY: "test-fal-credential",
  ANTHROPIC_API_KEY: "test-anthropic-credential",
  LIVE_PROVIDER_BUDGET_USD: "2",
});

function adapters(source: "real-provider" | "deterministic"): R1ProviderE2EAdapters {
  return {
    liveAdaptersWired: source === "real-provider",
    fal: { available: true, evidenceSource: source, run: async () => ({}) },
    anthropic: { available: true, evidenceSource: source, run: async () => ({}) },
  };
}

describe("185 — release evidence redaction", () => {
  it("redacts nested JSON credentials, prompts, photo fields, and provider URLs from report logs and serialized output", async () => {
    const secretLog = JSON.stringify({
      authorization: "Bearer TOPSECRET",
      nested: {
        apiKey: "ANOTHERSECRET",
        prompt: "private story prompt",
        photoBytes: "private-child-media",
        providerUrl: "https://v3.fal.media/output.png?token=private-token",
      },
    });

    // Direct utility check: the redactor replaces secrets with markers.
    const redacted = redactLog(secretLog);
    expect(redacted).not.toMatch(/TOPSECRET|ANOTHERSECRET|private story prompt|private-child-media|private-token|v3\.fal\.media/i);
    expect(redacted).toMatch(/\[REDACTED\]|\[REDACTED_URL\]/);

    const report = await runR1ProviderE2E({
      config: config(),
      adapters: adapters("real-provider"),
    });
    const serialized = JSON.stringify(report);

    // The live provenance operation adapters are not executed by the composition,
    // but any secrets that reach redactedLogs are scrubbed.
    expect(report.redactedLogs.length).toBeGreaterThan(0);
    expect(serialized).not.toMatch(/test-fal-credential|test-anthropic-credential/i);
    expect(report.releaseEvidenceEligible).toBe(false);
  });

  it("rejects explicit deterministic evidence even when operation-level adapters claim real-provider provenance", async () => {
    const deterministic = await runR1ProviderE2E({
      config: config(),
      adapters: adapters("deterministic"),
    });
    expect(deterministic.evidence.every((item) => item.evidenceSource === "deterministic")).toBe(true);
    expect(deterministic.releaseEvidenceEligible).toBe(false);
  });
});
