import { describe, expect, it } from "vitest";
import { DataStore } from "@/db/store";
import {
  CostThreshold,
  ProviderCostMeteringService,
  SpendBlockedError,
} from "@/services/provider-cost-metering";

describe("183 — production spend authorization boundaries", () => {
  it("fails closed when P95 full-cap margin evidence is absent or below the 70% floor", () => {
    const meter = new ProviderCostMeteringService(new DataStore());
    const route = {
      familyId: "family-183",
      provider: "fal.ai",
      endpoint: "fal-ai/flux-2/lora",
      model: "flux-2-lora",
      budgetUsd: 1,
      actualCostUsd: 1,
    };

    expect(() => meter.authorizeSpend(route)).toThrow(SpendBlockedError);
    expect(() =>
      meter.authorizeSpend({ ...route, p95FullCapMarginPercent: 69.99 })
    ).toThrow(SpendBlockedError);
    expect(
      meter.authorizeSpend({ ...route, p95FullCapMarginPercent: 70 })
    ).toBe(CostThreshold.GREEN);
  });

  it("applies durable all, provider, model, and endpoint controls only to matching routes", () => {
    const meter = new ProviderCostMeteringService(new DataStore());
    const familyId = "family-183";
    const route = {
      familyId,
      provider: "fal.ai",
      endpoint: "fal-ai/flux-2/lora",
      model: "flux-2-lora",
    };

    for (const control of [
      { scope: "all" as const },
      { scope: "provider" as const, provider: route.provider },
      { scope: "model" as const, model: route.model },
      { scope: "endpoint" as const, endpoint: route.endpoint },
    ]) {
      const isolated = new ProviderCostMeteringService(new DataStore());
      isolated.setKillSwitch({
        familyId,
        ...control,
        threshold: CostThreshold.RED,
        reason: "deterministic test control",
      });
      expect(() => isolated.assertSpendAllowed(route)).toThrow(SpendBlockedError);
      expect(() =>
        isolated.assertSpendAllowed({ ...route, familyId: "other-family" })
      ).not.toThrow();
    }
  });

  it("records unknown billing as a sanitized terminal attempt rather than treating it as free", () => {
    const store = new DataStore();
    const meter = new ProviderCostMeteringService(store);
    const entry = meter.recordAttempt({
      provider: "anthropic",
      endpoint: "messages.create",
      model: "claude-sonnet-4-6",
      pricingVersion: "r1-text-v1",
      units: { input_tokens: 100, output_tokens: 10 },
      estimatedCostUsd: 0.01,
      latencyMs: 120,
      requestId: "provider-request-183",
      owningEntityIds: { familyId: "family-183", storybookId: "book-183" },
      attemptType: "text",
      outcome: "unknown",
      prompt: "never persist this private prompt",
      providerUrl: "https://tokenized.example/private",
    } as never);

    expect(entry).toMatchObject({ outcome: "unknown", actualCostUsd: null });
    expect(JSON.stringify(entry)).not.toMatch(/private prompt|tokenized/);
    expect(meter.queryStorybookCost("family-183", "book-183").failedAttemptCostUsd).toBe(0.01);
  });
});
