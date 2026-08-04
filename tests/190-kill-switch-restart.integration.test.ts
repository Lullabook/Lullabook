import { describe, expect, it } from "vitest";
import { getProductionStoryModel } from "@/adapters/anthropic";
import {
  FAL_FLUX_1_LORA_ENDPOINT,
  FAL_FLUX_1_LORA_MODEL,
  FAL_FLUX_1_TRAIN_ENDPOINT,
} from "@/adapters/fal";
import { DataStore } from "@/db/store";
import {
  CostThreshold,
  ProviderCostMeteringService,
  SpendBlockedError,
} from "@/services/provider-cost-metering";
import { createReadyAdult, createTestContext, subscribedGuardian } from "@/test/fixtures";

/**
 * Issue 190 — persisted red kill switches.
 *
 * Kill switches are durable controls (Supabase `provider_kill_switches`,
 * hydrated into the DataStore on startup). "Restart" is simulated by writing
 * a switch in one store/meter instance and hydrating the same switch rows
 * into a fresh store — exactly what the durable store does when a process
 * restarts — then proving new payable work is blocked, while existing drafts
 * stay readable and Hard-delete stays available.
 */
describe("190 — persisted kill switches block new payable work after restart", () => {
  /** Mirror of the durable store's hydration: copy persisted switch rows into a fresh store. */
  function hydrateKillSwitches(from: DataStore, into: DataStore): void {
    for (const [id, ks] of from.providerKillSwitches) {
      into.providerKillSwitches.set(id, ks);
    }
  }

  const anthropicRoute = {
    familyId: "family-190-ks",
    provider: "anthropic",
    endpoint: "messages.create",
    model: getProductionStoryModel(),
  };
  const marginEvidence = { netSubscriptionRevenueUsd: 100, attributableCogsUsd: 20 };

  it("a persisted red GLOBAL switch blocks new payable work after restart", () => {
    const storeA = new DataStore();
    const meterA = new ProviderCostMeteringService(storeA);
    meterA.setKillSwitch({
      scope: "all",
      threshold: CostThreshold.RED,
      reason: "red global control survives restart",
    });

    // Restart: a fresh process hydrates the persisted switch rows.
    const storeB = new DataStore();
    hydrateKillSwitches(storeA, storeB);
    const meterB = new ProviderCostMeteringService(storeB);

    expect(meterB.getKillSwitches()).toHaveLength(1);
    expect(() => meterB.assertSpendAllowed(anthropicRoute)).toThrow(SpendBlockedError);
    expect(() =>
      meterB.authorizeSpend({ ...anthropicRoute, marginEvidence })
    ).toThrow(SpendBlockedError);
    expect(meterB.getControls()).toEqual({ canCreateSpend: false, canViewDrafts: true, canHardDelete: true });
  });

  it("persisted provider/model/endpoint switches survive restart and only match their scope", () => {
    const trainingRoute = {
      familyId: "family-190-ks",
      provider: "fal.ai",
      endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
      model: FAL_FLUX_1_LORA_MODEL,
    };
    const imageRoute = {
      familyId: "family-190-ks",
      provider: "fal.ai",
      endpoint: FAL_FLUX_1_LORA_ENDPOINT,
      model: FAL_FLUX_1_LORA_MODEL,
    };
    const controls = [
      { scope: "provider" as const, provider: "fal.ai", blocks: trainingRoute, spares: anthropicRoute },
      {
        scope: "endpoint" as const,
        endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
        blocks: trainingRoute,
        spares: imageRoute,
      },
      { scope: "model" as const, model: FAL_FLUX_1_LORA_MODEL, blocks: trainingRoute, spares: anthropicRoute },
    ];

    for (const control of controls) {
      const storeA = new DataStore();
      new ProviderCostMeteringService(storeA).setKillSwitch({
        familyId: "family-190-ks",
        ...control,
        threshold: CostThreshold.RED,
        reason: "scoped control survives restart",
      });
      const storeB = new DataStore();
      hydrateKillSwitches(storeA, storeB);
      const meterB = new ProviderCostMeteringService(storeB);
      expect(() => meterB.assertSpendAllowed(control.blocks)).toThrow(SpendBlockedError);
      expect(() => meterB.assertSpendAllowed(control.spares)).not.toThrow();
    }
  });

  it("existing drafts remain readable while a red switch is active", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await createReadyAdult(ctx, guardian);

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "draft survives red",
    });
    await ctx.workflow.drain();
    const draft = ctx.store.getStorybook(book.id, guardian.id)!;
    expect(draft.status).toBe("draft");

    // A red switch becomes active (simulated restart with the same store data).
    const meter = new ProviderCostMeteringService(ctx.store);
    meter.setKillSwitch({
      scope: "all",
      threshold: CostThreshold.RED,
      reason: "red while drafts exist",
    });
    expect(() => meter.assertSpendAllowed(anthropicRoute)).toThrow(SpendBlockedError);

    // The draft is still readable and non-payable operations still work.
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("draft");
    expect(ctx.storybooks.finalize(guardian.id, book.id).status).toBe("finalized");
    expect(ctx.store.getStorybook(book.id, guardian.id)!.status).toBe("finalized");
  });

  it("hard-delete remains available while a red switch is active", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await createReadyAdult(ctx, guardian);
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "learning",
      theme: "delete under red",
    });
    await ctx.workflow.drain();
    expect(ctx.store.getStorybook(book.id, guardian.id)).toBeTruthy();

    const meter = new ProviderCostMeteringService(ctx.store);
    const familySwitch = meter.setKillSwitch({
      familyId: guardian.familyId,
      scope: "all",
      threshold: CostThreshold.RED,
      reason: "family red while hard-delete runs",
    });
    meter.setKillSwitch({
      scope: "all",
      threshold: CostThreshold.RED,
      reason: "global red while hard-delete runs",
    });

    await ctx.hardDelete.hardDelete(guardian.id);

    expect(ctx.store.families.has(guardian.familyId)).toBe(false);
    expect(ctx.store.storybooks.has(book.id)).toBe(false);
    expect([...ctx.store.personas.values()].filter((p) => p.familyId === guardian.familyId)).toHaveLength(0);
    // The family-scoped switch is erased with the Family; the global control
    // is not Family data and survives (correct — it is not the Family's).
    expect(meter.getKillSwitches().some((s) => s.id === familySwitch.id)).toBe(false);
    expect(meter.getKillSwitches().some((s) => s.id !== familySwitch.id)).toBe(true);
  });
});
