import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIVE_EVIDENCE_MISSING_STEPS,
  runReachableReleaseGate,
  scanReleaseProfile,
  type NativeEvidence,
  evaluateLiveEvidence,
} from "../tools/release-gate";

const ROOT = process.cwd();

describe("195 — native/live evidence is a separate, fail-closed contract", () => {
  it("reports every absent native and production-like proof as BLOCKED, never PASS", async () => {
    const report = await runReachableReleaseGate({ liveEvidence: {} });

    expect(report.liveEvidence).toEqual({
      status: "blocked",
      missingEvidence: expect.arrayContaining(Object.values(LIVE_EVIDENCE_MISSING_STEPS)),
    });
    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.status).toBe("blocked");
    expect(JSON.stringify(report.liveEvidence)).not.toContain("PASS");
  });

  it("turns live evidence green only when every separately-owned marker is present", () => {
    const evidence: NativeEvidence = {
      nativeSimulatorOrTestFlightSmoke: true,
      providerEvidenceSource: "real-provider",
      realProviderRequestIds: ["req-anthropic-195", "req-fal-195"],
      billingReconciliation: true,
      actualProviderCostUsd: 1.23,
      realOwnedLoraArtifacts: ["lora/family-195/persona-a.safetensors", "lora/family-195/persona-b.safetensors"],
      rlsEvidence: true,
      hardDeleteEvidence: true,
    };

    expect(evaluateLiveEvidence(evidence)).toEqual({
      status: "passed",
      missingEvidence: [],
    });

    expect(evaluateLiveEvidence({ ...evidence, realOwnedLoraArtifacts: [] })).toEqual({
      status: "blocked",
      missingEvidence: [LIVE_EVIDENCE_MISSING_STEPS.realOwnedLoraArtifacts],
    });
  });

  it("allows the full gate to pass only when the separately-owned evidence markers are present", async () => {
    const report = await runReachableReleaseGate({
      liveEvidence: {
        nativeSimulatorOrTestFlightSmoke: true,
        providerEvidenceSource: "real-provider",
        realProviderRequestIds: ["req-anthropic-195", "req-fal-195"],
        billingReconciliation: true,
        actualProviderCostUsd: 1.23,
        realOwnedLoraArtifacts: ["lora/family-195/persona-a.safetensors", "lora/family-195/persona-b.safetensors"],
        rlsEvidence: true,
        hardDeleteEvidence: true,
      },
    });

    expect(report.liveEvidence).toEqual({ status: "passed", missingEvidence: [] });
    expect(report.releaseEvidenceEligible).toBe(true);
    expect(report.decision.status).toBe("passed");
  });

  it("scans the actual checked-in EAS release profiles and mobile config", () => {
    const scan = scanReleaseProfile(ROOT);

    expect(scan.files).toEqual(expect.arrayContaining([
      "mobile/eas.json",
      "mobile/app.json",
      "mobile/app.config.ts",
    ]));
    expect(scan.status).toBe("passed");
    expect(scan.violations).toEqual([]);
  });

  it("does not mistake documentation or dev-only scripts for release profile config", () => {
    const eas = readFileSync(join(ROOT, "mobile/eas.json"), "utf8");
    const appConfig = readFileSync(join(ROOT, "mobile/app.config.ts"), "utf8");

    expect(eas).toContain('"production"');
    expect(appConfig).toContain("extra:");
    expect(appConfig).not.toMatch(/FAL_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  });
});
