import { describe, expect, it } from "vitest";

import {
  createR1ProviderE2EConfig,
  runR1ProviderE2E,
} from "@/services/r1-provider-e2e";
import { createDeterministicR1ProviderE2EComposition } from "@/services/r1-provider-e2e-deterministic";

const config = () => createR1ProviderE2EConfig({
  FAL_API_KEY: "test-fal-credential",
  ANTHROPIC_API_KEY: "test-anthropic-credential",
  LIVE_PROVIDER_BUDGET_USD: "2",
  LIVE_PROVIDER_RUN_APPROVED: "true",
});

describe("185 — production-like release-gate composition", () => {
  it("executes every accepted R1 stage against one stateful fixture and keeps deterministic evidence non-release-eligible", async () => {
    const report = await runR1ProviderE2E({
      config: config(),
      composition: createDeterministicR1ProviderE2EComposition(),
    });

    expect(report.flowPlan.map((item) => [item.id, item.status])).toEqual(
      report.flowPlan.map((item) => [item.id, "passed"]),
    );
    expect(report.flowChecklist).toEqual({ total: 16, passed: 16, failed: 0, pending: 0 });
    expect(report.stageEvidence.map((item) => item.stageId)).toEqual(
      report.flowPlan.map((item) => item.id),
    );
    expect(report.evidence.length).toBeGreaterThan(3);
    expect(report.evidence.every((item) => item.evidenceSource === "deterministic")).toBe(true);
    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.status).toBe("blocked");
  });

  it("proves recovery, idempotency, allowance, isolation, and deletion from executed state rather than checklist labels", async () => {
    const report = await runR1ProviderE2E({
      config: config(),
      composition: createDeterministicR1ProviderE2EComposition(),
    });
    const stages = new Map(report.stageEvidence.map((item) => [item.stageId, item]));

    expect(stages.get("forced-text-failure")?.details).toMatchObject({
      storyStatus: "failed",
      allowanceReleased: 1,
      imageCalls: 0,
    });
    expect(stages.get("page-failure")?.details).toMatchObject({
      storyStatus: "draft",
      failedPages: 1,
      allowanceCommitted: true,
    });
    expect(stages.get("repair-failure")?.details).toMatchObject({
      pageStatus: "failed",
      repairAttempts: 2,
      allowanceDelta: 0,
    });
    expect(stages.get("duplicate-callback")?.details).toMatchObject({
      duplicateAccepted: true,
      artifactDownloads: 2,
      costLedgerDelta: 0,
    });
    expect(stages.get("rls-cross-family-denial")?.details).toMatchObject({
      denied: true,
    });
    expect(stages.get("hard-delete")?.details).toMatchObject({
      deletedFamilyDataRemaining: false,
      deletedDatabaseRows: expect.any(Number),
      deletedBlobKeys: expect.any(Number),
      deletedProviderArtifacts: 2,
      otherFamilyDataRemaining: true,
    });
    expect(Number(stages.get("hard-delete")?.details?.deletedDatabaseRows)).toBeGreaterThan(0);
    expect(Number(stages.get("hard-delete")?.details?.deletedBlobKeys)).toBeGreaterThan(0);
    expect(report.storyAllowanceAccounting).toEqual({
      allowed: 4,
      reserved: 0,
      released: 1,
      committed: 2,
      remaining: 2,
    });
  });
});
