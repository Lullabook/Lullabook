import { describe, expect, it } from "vitest";
import { createTestContext, subscribedGuardian } from "@/test/fixtures";
import {
  CostThreshold,
  ProviderCostMeteringService,
  SpendBlockedError,
} from "@/services/provider-cost-metering";
import { StoryCapError, StoryCapService } from "@/services/story-cap";
import { R1_PLAN_DEFINITION } from "@/domain/plan";

describe("183 — provider COGS metering and margin/cost kill switches", () => {
  it("records every provider attempt with ownership and redacts prompt, photo bytes, and credentials", () => {
    const ctx = createTestContext();
    const meter = new ProviderCostMeteringService(ctx.store);

    const entry = meter.recordAttempt({
      provider: "fal",
      endpoint: "fal-ai/flux-2/lora",
      model: "flux-2-lora-v2",
      pricingVersion: "fal-2026-07-20",
      units: { images: 1, megapixels: 1 },
      estimatedCostUsd: 0.03,
      actualCostUsd: 0.031,
      latencyMs: 840,
      requestId: "req-183",
      owningEntityIds: {
        familyId: "family-1",
        personaId: "persona-1",
        storybookId: "book-1",
        pageId: "page-1",
      },
      attemptType: "image",
      outcome: "succeeded",
      prompt: "Maya's private bedtime prompt",
      photoBytes: Buffer.from("private-photo"),
      credentials: { FAL_API_KEY: "secret" },
    } as never);

    expect(entry).toMatchObject({
      provider: "fal",
      endpoint: "fal-ai/flux-2/lora",
      model: "flux-2-lora-v2",
      pricingVersion: "fal-2026-07-20",
      units: { images: 1, megapixels: 1 },
      estimatedCostUsd: 0.03,
      actualCostUsd: 0.031,
      latencyMs: 840,
      requestId: "req-183",
      owningEntityIds: {
        familyId: "family-1",
        personaId: "persona-1",
        storybookId: "book-1",
        pageId: "page-1",
      },
      outcome: "succeeded",
    });
    expect(entry).not.toHaveProperty("prompt");
    expect(entry).not.toHaveProperty("photoBytes");
    expect(entry).not.toHaveProperty("credentials");
    expect(JSON.stringify([...ctx.store.providerCostLedgerEntries.values()])).not.toMatch(
      /private-bedtime|private-photo|FAL_API_KEY|secret/
    );
  });

  it("separately queries attempted and successful Storybook cost, failed retries, and training amortization", () => {
    const ctx = createTestContext();
    const meter = new ProviderCostMeteringService(ctx.store);
    const owner = { familyId: "family-1", storybookId: "book-1" };
    const base = {
      provider: "anthropic" as const,
      endpoint: "anthropic.messages.create",
      model: "claude-sonnet-4-6",
      pricingVersion: "anthropic-2026-07",
      units: { inputTokens: 1000, outputTokens: 500 },
      estimatedCostUsd: 0.02,
      latencyMs: 100,
      requestId: "req",
      owningEntityIds: owner,
      attemptType: "text" as const,
    };

    meter.recordAttempt({ ...base, requestId: "failed", actualCostUsd: 0.01, outcome: "failed" });
    meter.recordAttempt({ ...base, requestId: "retry", actualCostUsd: 0.02, outcome: "succeeded" });
    meter.recordTrainingAmortization({
      provider: "fal",
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-trainer-v2",
      pricingVersion: "fal-2026-07-20",
      units: { trainingSteps: 300 },
      costUsd: 0.08,
      latencyMs: 2000,
      requestId: "train-1",
      owningEntityIds: { ...owner, personaId: "persona-1" },
    });

    expect(meter.queryStorybookCost("family-1", "book-1")).toMatchObject({
      attemptedCostUsd: 0.11,
      successfulCostUsd: 0.02,
      failedAttemptCostUsd: 0.01,
      retryCount: 1,
      trainingAmortizationCostUsd: 0.08,
    });
  });

  it("enforces the shared four-Story allowance atomically and resets without rollover or Persona multiplication", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const cap = new StoryCapService(ctx.store, ctx.entitlements);
    const familyId = guardian.familyId;

    expect(R1_PLAN_DEFINITION.limits.storybooksPerMonth).toBe(4);
    for (let i = 0; i < 3; i++) cap.reserve(familyId, guardian.id, `book-${i}`);
    const results = await Promise.allSettled([
      Promise.resolve().then(() => cap.reserve(familyId, guardian.id, "book-3")),
      Promise.resolve().then(() => cap.reserve(familyId, guardian.id, "book-4")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({
      reason: expect.any(StoryCapError),
    });
    expect(cap.getUsage(familyId, guardian.id).count).toBe(4);

    cap.resetForTesting(familyId, guardian.id);
    expect(cap.getUsage(familyId, guardian.id).count).toBe(0);
    expect(cap.getUsage(familyId, guardian.id).cap).toBe(4);
  });

  it("classifies budget variance at green, amber, and red, including the P95 full-cap margin floor", () => {
    const ctx = createTestContext();
    const meter = new ProviderCostMeteringService(ctx.store);
    expect(meter.evaluateThreshold({ budgetUsd: 1, actualCostUsd: 0.95 })).toBe(CostThreshold.GREEN);
    expect(meter.evaluateThreshold({ budgetUsd: 1, actualCostUsd: 1.05 })).toBe(CostThreshold.GREEN);
    expect(meter.evaluateThreshold({ budgetUsd: 1, actualCostUsd: 1.06 })).toBe(CostThreshold.AMBER);
    expect(meter.evaluateThreshold({ budgetUsd: 1, actualCostUsd: 1.1 })).toBe(CostThreshold.AMBER);
    expect(meter.evaluateThreshold({ budgetUsd: 1, actualCostUsd: 1.11 })).toBe(CostThreshold.RED);
    expect(
      meter.evaluateThreshold({
        budgetUsd: 1,
        actualCostUsd: 1,
        p95FullCapMarginPercent: 69.99,
      })
    ).toBe(CostThreshold.RED);
  });

  it("a red threshold blocks new spend or one provider/model route while drafts and Hard-delete controls remain available", () => {
    const ctx = createTestContext();
    const meter = new ProviderCostMeteringService(ctx.store);
    meter.setKillSwitch({
      scope: "provider-model",
      provider: "fal",
      model: "flux-2-lora-v2",
      threshold: CostThreshold.RED,
      reason: "P95 margin floor breached",
    });

    expect(() => meter.assertSpendAllowed({ provider: "fal", model: "flux-2-lora-v2" })).toThrow(
      SpendBlockedError
    );
    expect(() => meter.assertSpendAllowed({ provider: "anthropic", model: "claude-sonnet-4-6" })).not.toThrow();
    expect(meter.getControls()).toEqual({ canCreateSpend: false, canHardDelete: true, canViewDrafts: true });
    expect(meter.getKillSwitches()).toHaveLength(1);
  });

  it("keeps refunded Story allowances and provider costs as append-only audit records", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const cap = new StoryCapService(ctx.store, ctx.entitlements);
    cap.reserve(guardian.familyId, guardian.id, "book-1");
    cap.release("book-1");
    expect(cap.getReservationAudit("book-1")).toMatchObject({ status: "released", familyId: guardian.familyId });

    const meter = new ProviderCostMeteringService(ctx.store);
    meter.recordAttempt({
      provider: "fal",
      endpoint: "fal-ai/flux-2/lora",
      model: "flux-2-lora-v2",
      pricingVersion: "v1",
      units: { images: 1 },
      estimatedCostUsd: 0.03,
      actualCostUsd: 0.02,
      latencyMs: 10,
      requestId: "refunded-attempt",
      owningEntityIds: { familyId: "family-1", storybookId: "book-1" },
      outcome: "failed",
      attemptType: "image",
    });
    expect(ctx.store.providerCostLedgerEntries.size).toBe(1);
  });

  it("rejects invalid pricing/cost data and never permits silent paid overage", () => {
    const ctx = createTestContext();
    const meter = new ProviderCostMeteringService(ctx.store);
    expect(() =>
      meter.recordAttempt({
        provider: "fal",
        endpoint: "endpoint",
        model: "model",
        pricingVersion: "v1",
        units: { images: 1 },
        estimatedCostUsd: -1,
        latencyMs: 10,
        requestId: "bad",
        owningEntityIds: { familyId: "family-1" },
        outcome: "succeeded",
        attemptType: "image",
      })
    ).toThrow();
    expect(() => meter.assertSpendAllowed({ provider: "fal", model: "model" })).not.toThrow();
  });
});
