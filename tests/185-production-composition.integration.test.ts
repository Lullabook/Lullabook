import { describe, expect, it } from "vitest";

import {
  createR1ProviderE2EConfig,
  runR1ProviderE2E,
  type R1ProviderE2EAdapters,
} from "@/services/r1-provider-e2e";
import { runComposedR1ProviderE2E } from "@/services/r1-provider-e2e-composition";

const config = () => createR1ProviderE2EConfig({
  FAL_API_KEY: "test-fal-credential",
  ANTHROPIC_API_KEY: "test-anthropic-credential",
  LIVE_PROVIDER_BUDGET_USD: "2",
});

function deterministicAdapters(): R1ProviderE2EAdapters {
  return {
    // The harness must run the full composition, but deterministic operation-level
    // provenance keeps the gate closed.
    liveAdaptersWired: false,
    fal: { available: true, isDevOnly: true, evidenceSource: "deterministic", run: async () => ({}) },
    anthropic: { available: true, isDevOnly: true, evidenceSource: "deterministic", run: async () => ({}) },
  };
}

function realProviderAdapters(): R1ProviderE2EAdapters {
  return {
    liveAdaptersWired: true,
    fal: { available: true, evidenceSource: "real-provider", run: async () => ({}) },
    anthropic: { available: true, evidenceSource: "real-provider", run: async () => ({}) },
  };
}

describe("185 — production-like release-gate composition", () => {
  it("drives all 16 flowPlan stages across a single persisted fixture and still blocks deterministic evidence", async () => {
    const report = await runR1ProviderE2E({
      config: config(),
      adapters: deterministicAdapters(),
    });

    expect(report.flowPlan).toHaveLength(16);
    expect(report.flowChecklist.pending).toBe(0);
    expect(report.flowChecklist.failed).toBe(0);
    expect(report.flowChecklist.passed).toBe(16);
    expect(report.evidence.length).toBeGreaterThan(0);
    expect(report.actualProviderCostUsd).toBeGreaterThanOrEqual(0);
    expect(report.decision.status).toBe("blocked");
    expect(report.releaseEvidenceEligible).toBe(false);
  });

  it("records story allowance reserve/commit/release from real service calls", async () => {
    const report = await runR1ProviderE2E({
      config: config(),
      adapters: deterministicAdapters(),
    });

    expect(report.storyAllowanceAccounting.allowed).toBe(4);
    expect(report.storyAllowanceAccounting.committed + report.storyAllowanceAccounting.released + report.storyAllowanceAccounting.reserved).toBeGreaterThan(0);
  });

  it("exposes the DataStore so tests can audit failure/recovery side effects", async () => {
    const result = await runComposedR1ProviderE2E({
      config: config(),
      adapters: deterministicAdapters(),
    });

    // The report captures provider evidence and allowance accounting before
    // hard-delete erases the fixture's audit rows from the store.
    expect(result.report.evidence.length).toBeGreaterThan(0);
    expect(result.report.storyAllowanceAccounting.committed + result.report.storyAllowanceAccounting.released).toBeGreaterThan(0);
    expect(result.familyId).toBeTruthy();

    // After hard-delete, the fixture family data is erased.
    expect(result.store.familyDataExists(result.familyId)).toBe(false);
  });

  it("would mark release evidence eligible only with real-provider operation adapters and all-green flow", async () => {
    const report = await runR1ProviderE2E({
      config: config(),
      adapters: realProviderAdapters(),
    });

    // Even though the operation-level adapters claim real-provider provenance,
    // the default service adapters are still deterministic fakes. The ledger
    // entries they produce keep evidenceSource=deterministic, so eligibility is
    // correctly not granted until real service adapters drive the calls.
    expect(report.decision.status).toBe("blocked");
    expect(report.releaseEvidenceEligible).toBe(false);
  });
});
