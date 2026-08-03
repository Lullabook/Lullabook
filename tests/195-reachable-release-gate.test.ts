import { describe, expect, it } from "vitest";
import {
  LIVE_EVIDENCE_MISSING_STEPS,
  RELEASE_GATE_FLOW,
  runReachableReleaseGate,
  scanReleaseProfileContents,
  type ReleaseProfileScanInput,
} from "../tools/release-gate";

describe("195 — deterministic reachable-app release gate", () => {
  it("runs the real in-memory composition boundary across the reachable flow", async () => {
    const report = await runReachableReleaseGate();
    const requiredStageIds = [
      "sign-in",
      "entitlement",
      "consent",
      "character",
      "persona",
      "storybook-enqueue",
      "bedtime-text",
      "learning-text",
      "twelve-pages",
      "reader",
      "finalize-pdf",
      "daily-notes",
      "failure-recovery",
      "rls",
      "hard-delete",
      "provider-cost",
      "cut-surfaces",
    ] as const;

    expect(report.deterministic.status).toBe("passed");
    expect(report.deterministic.flowChecklist).toEqual({
      total: RELEASE_GATE_FLOW.length,
      passed: RELEASE_GATE_FLOW.length,
      failed: 0,
      pending: 0,
    });
    expect(report.deterministic.stages.map((stage) => stage.id)).toEqual(
      RELEASE_GATE_FLOW.map((stage) => stage.id),
    );

    const stage = new Map(report.deterministic.stages.map((item) => [item.id, item]));
    for (const id of requiredStageIds) {
      expect(stage.get(id)?.status, id).toBe("passed");
    }

    expect(stage.get("bedtime-text")?.details).toMatchObject({
      storyType: "bedtime",
      pages: 12,
    });
    expect(stage.get("learning-text")?.details).toMatchObject({
      storyType: "learning",
      pages: 12,
    });
    expect(stage.get("twelve-pages")?.details).toMatchObject({ pageCount: 12 });
    expect(stage.get("daily-notes")?.details).toMatchObject({ timelineEntries: 1 });
    expect(stage.get("failure-recovery")?.details).toMatchObject({
      invalidTextStatus: "failed",
      recoveredPageStatus: "ready",
    });
    expect(stage.get("rls")?.details).toMatchObject({ denied: true });
    expect(stage.get("hard-delete")?.details).toMatchObject({
      deletedFamilyDataRemaining: false,
      otherFamilyDataRemaining: true,
    });

    expect(report.deterministic.providerEvidence.requestIds.length).toBeGreaterThan(0);
    expect(report.deterministic.providerEvidence.attempts).toBeGreaterThan(0);
    expect(report.deterministic.providerEvidence.failures).toBeGreaterThan(0);
    expect(report.deterministic.providerEvidence.estimatedCostUsd).toBeGreaterThan(0);
    expect(report.deterministic.providerEvidence.actualCostUsd).toBeGreaterThanOrEqual(0);
    expect(report.deterministic.providerEvidence.actualCostReconciled).toBe(false);
    expect(report.deterministic.failures.length).toBeGreaterThan(0);
    expect(report.deterministic.cutSurfaces.every((surface) => surface.status === "inert")).toBe(true);
    expect(report.deterministic.twoPersona.realOwnedLoraArtifacts).toBe(false);
    expect(report.deterministic.twoPersona.status).toBe("blocked");
    expect(report.deterministic.twoPersona.blockedStep).toContain("real Family-owned LoRA artifacts");

    // Deterministic fakes prove wiring only. They never turn the release claim
    // green and every absent live/native proof remains explicitly blocked.
    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.status).toBe("blocked");
    expect(report.liveEvidence.status).toBe("blocked");
    expect(report.liveEvidence.missingEvidence).toEqual(
      expect.arrayContaining(Object.values(LIVE_EVIDENCE_MISSING_STEPS)),
    );
    expect(JSON.stringify(report)).not.toMatch(/raw photo|photo bytes|private prompt|api[_-]?key|password/i);
  });

  it("does not let a release profile ship provider keys or development bypasses", () => {
    const input: ReleaseProfileScanInput = {
      "mobile/eas.json": JSON.stringify({
        build: {
          preview: {
            env: {
              FAL_API_KEY: "provider-secret",
              SUPABASE_SERVICE_ROLE_KEY: "privileged-secret",
              EXPO_PUBLIC_DEV_PASSWORD: "sim-secret",
              DEV_FORCE_SUBSCRIPTION: "active",
              DEV_LIVENESS_BYPASS: "true",
              DEV_FAL_FALLBACK: "true",
              DEV_DEMO_SEED: "true",
            },
          },
          production: {},
        },
      }),
      "mobile/app.json": "{}",
      "mobile/app.config.ts": "export default {};",
    };

    const scan = scanReleaseProfileContents(input);

    expect(scan.status).toBe("failed");
    expect(scan.violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining([
        "provider-key",
        "privileged-supabase-key",
        "dev-password",
        "force-subscription",
        "liveness-bypass",
        "fal-fallback",
        "demo-seed",
      ]),
    );
  });
});
