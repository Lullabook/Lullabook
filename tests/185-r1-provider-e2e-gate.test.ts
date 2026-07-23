import { describe, expect, it } from "vitest";
import {
  APPROVED_R1_PROVIDER_E2E_CEILING_USD,
  CostThreshold,
  DEFAULT_R1_PROVIDER_E2E_MANIFEST,
  R1ProviderE2EConfigError,
  createR1ProviderE2EConfig,
  evaluateR1ProviderE2EGate,
  runR1ProviderE2E,
  type R1ProviderE2EAdapters,
  type R1ProviderE2EGateInput,
} from "@/services/r1-provider-e2e";

const env = (budget = 2) => ({
  FAL_API_KEY: "placeholder-fal-credential",
  ANTHROPIC_API_KEY: "placeholder-anthropic-credential",
  LIVE_PROVIDER_BUDGET_USD: String(budget),
});

const blockedAdapters = (): R1ProviderE2EAdapters => ({
  liveAdaptersWired: false,
  fal: { available: false, run: async () => { throw new Error("unavailable"); } },
  anthropic: { available: false, run: async () => { throw new Error("unavailable"); } },
});

const gateInput = (overrides: Partial<R1ProviderE2EGateInput> = {}): R1ProviderE2EGateInput => ({
  modeledAnnualFullCapP95MarginPercent: 72,
  ordinaryStoryCost: { threshold: CostThreshold.GREEN, actualCostUsd: 0.2, budgetUsd: 0.2 },
  selectedRoute: { provider: "fal.ai", model: "fal-ai/flux-2/lora" },
  canaryDecision: { provider: "fal.ai", model: "fal-ai/flux-2/lora" },
  approvalFlag: false,
  releaseEvidenceAvailable: true,
  ...overrides,
});

describe("185 — production-like native R1 real-provider release gate", () => {
  it("refuses missing credentials, a non-positive live budget, and budgets over the approved $2 ceiling", () => {
    expect(() => createR1ProviderE2EConfig({ ...env(), FAL_API_KEY: "" })).toThrow(R1ProviderE2EConfigError);
    expect(() => createR1ProviderE2EConfig({ ...env(), ANTHROPIC_API_KEY: undefined })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => createR1ProviderE2EConfig({ ...env(), LIVE_PROVIDER_BUDGET_USD: "0" })).toThrow(/positive/);
    expect(() => createR1ProviderE2EConfig({ ...env(), LIVE_PROVIDER_BUDGET_USD: "not-a-number" })).toThrow(/positive/);
    expect(() => createR1ProviderE2EConfig(env(APPROVED_R1_PROVIDER_E2E_CEILING_USD + 0.01))).toThrow(R1ProviderE2EConfigError);
  });

  it("declares synthetic-subjects and consenting-adults fixture policy in the manifest", () => {
    expect(DEFAULT_R1_PROVIDER_E2E_MANIFEST.fixturePolicy).toMatchObject({
      allowedSubjects: expect.arrayContaining(["synthetic-subjects", "consenting-adults"]),
      prohibitedSubjects: expect.arrayContaining(["minors", "unrelated-personal-data"]),
    });
    expect(DEFAULT_R1_PROVIDER_E2E_MANIFEST.fixturePolicy.statement).toMatch(/synthetic|consenting/i);
  });

  it("publishes evidence fields without retaining credentials, prompts, or photo content", async () => {
    const report = await runR1ProviderE2E({
      config: createR1ProviderE2EConfig(env()),
      adapters: blockedAdapters(),
      now: (() => {
        let tick = 0;
        return () => new Date(`2026-07-21T00:00:0${tick++}Z`);
      })(),
    });

    expect(report).toMatchObject({
      schemaVersion: "185-r1-provider-e2e/v1",
      ticket: 185,
      durationMs: expect.any(Number),
      actualProviderCostUsd: expect.any(Number),
      requestIds: expect.any(Array),
      redactedLogs: expect.any(Array),
      storyAllowanceAccounting: expect.objectContaining({
        allowed: expect.any(Number),
        reserved: expect.any(Number),
        released: expect.any(Number),
        remaining: expect.any(Number),
      }),
      modelVersions: expect.any(Object),
      pricingVersions: expect.any(Object),
      decision: expect.objectContaining({ status: "blocked" }),
      releaseEvidenceEligible: false,
    });
    expect(report.redactedLogs.every((line) => !/placeholder-.*credential|prompt|photo|raw image/i.test(line))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/placeholder-.*credential|raw prompt|photo bytes|raw photo/i);
    expect(report.evidence.every((item) =>
      ["requestId", "provider", "endpoint", "model", "pricingVersion", "durationMs", "actualCostUsd", "redactedLog"].every(
        (key) => key in item
      )
    )).toBe(true);
  });

  it("fails the gate below the 70% full-cap/P95 margin floor", () => {
    const decision = evaluateR1ProviderE2EGate(gateInput({ modeledAnnualFullCapP95MarginPercent: 69.99 }));
    expect(decision.status).toBe("failed");
    expect(decision.failures).toEqual(expect.arrayContaining([expect.stringMatching(/70%|margin/i)]));
  });

  it("fails the gate when ordinary Story cost is red", () => {
    const decision = evaluateR1ProviderE2EGate(gateInput({ ordinaryStoryCost: { threshold: CostThreshold.RED, actualCostUsd: 0.5, budgetUsd: 0.2 } }));
    expect(decision.status).toBe("failed");
    expect(decision.failures).toEqual(expect.arrayContaining([expect.stringMatching(/Story.*red|red.*Story/i)]));
  });

  it("fails a canary route mismatch unless an explicit approval flag is present", () => {
    const mismatch = evaluateR1ProviderE2EGate(gateInput({
      selectedRoute: { provider: "fal.ai", model: "fal-ai/flux-1/lora" },
    }));
    expect(mismatch.status).toBe("failed");
    expect(mismatch.failures).toEqual(expect.arrayContaining([expect.stringMatching(/canary|provider|model/i)]));

    expect(evaluateR1ProviderE2EGate(gateInput({
      selectedRoute: { provider: "fal.ai", model: "fal-ai/flux-1/lora" },
      approvalFlag: true,
    })).status).toBe("passed");
  });

  it("blocks without live adapters and never treats dev fakes as release evidence", async () => {
    const report = await runR1ProviderE2E({
      config: createR1ProviderE2EConfig(env()),
      adapters: {
        ...blockedAdapters(),
        liveAdaptersWired: true,
        fal: { available: true, isDevOnly: true, run: async () => ({}) },
        anthropic: { available: true, isDevOnly: true, run: async () => ({}) },
      },
    });
    expect(report.decision.status).toBe("blocked");
    expect(report.releaseEvidenceEligible).toBe(false);
    expect(report.decision.missingEvidence).toEqual(expect.arrayContaining([expect.stringMatching(/live|provider|adapter/i)]));
  });

  it("enumerates the paid-run flow and every required recovery/isolation checklist item", () => {
    const checklist = JSON.stringify(DEFAULT_R1_PROVIDER_E2E_MANIFEST.flowPlan);
    for (const required of [
      "trial", "consent", "multiple Family people", "Babies", "train", "review", "accept", "Brief",
      "valid Story", "12 Page jobs", "readable draft", "two-Persona Scene", "forced text failure",
      "Page failure", "duplicate callback", "repair failure", "RLS cross-Family denial", "Hard-delete",
    ]) {
      expect(checklist).toMatch(new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });
});
