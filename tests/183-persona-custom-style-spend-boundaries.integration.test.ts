import { describe, expect, it } from "vitest";

import {
  FAL_FLUX_1_LORA_ENDPOINT,
  FAL_FLUX_1_LORA_MODEL,
  FAL_FLUX_1_TRAIN_ENDPOINT,
} from "@/adapters/fal";
import { FakeFal } from "@/adapters/fakes";
import type { FalTrainResult } from "@/adapters/types";
import type { Tier } from "@/domain/types";
import { CustomStyleService } from "@/services/custom-style";
import { CostThreshold, ProviderCostMeteringService, SpendBlockedError } from "@/services/provider-cost-metering";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";

function setTier(ctx: ReturnType<typeof createTestContext>, familyId: string, tier: Tier): void {
  const existing = ctx.store.getSubscription(familyId);
  ctx.store.saveSubscription({
    familyId,
    status: "active",
    stripeCustomerId: existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: existing?.stripeSubscriptionId ?? null,
    tier,
    updatedAt: new Date(),
  });
}

class FailingTrainingFal extends FakeFal {
  override async startTraining(_photos: Buffer[]): Promise<FalTrainResult> {
    this.trainCalls++;
    throw new Error("fal training unavailable");
  }
}

describe("183 — Persona and custom-style spend boundaries", () => {
  it("uses canonical routes and persists Family-owned terminal training/image receipts", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);

    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Metered guardian",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    const entries = [...ctx.store.providerCostLedgerEntries.values()]
      .filter((entry) => entry.owningEntityIds.personaId === persona.id);

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
        model: FAL_FLUX_1_LORA_MODEL,
        attemptType: "training",
        outcome: "succeeded",
        owningEntityIds: { familyId: guardian.familyId, personaId: persona.id },
      }),
      expect.objectContaining({
        endpoint: FAL_FLUX_1_LORA_ENDPOINT,
        model: FAL_FLUX_1_LORA_MODEL,
        attemptType: "image",
        outcome: "succeeded",
        owningEntityIds: { familyId: guardian.familyId, personaId: persona.id },
      }),
    ]));
    expect(entries.filter((entry) => entry.attemptType === "image")).toHaveLength(3);

    setTier(ctx, guardian.familyId, "plus");
    await ctx.customStyles.startTraining({
      familyId: guardian.familyId,
      memberId: guardian.id,
      referenceImages: [goodPhoto()],
      seed: "metered style",
    });
    expect([...ctx.store.providerCostLedgerEntries.values()]).toContainEqual(
      expect.objectContaining({
        endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
        model: FAL_FLUX_1_LORA_MODEL,
        attemptType: "training",
        outcome: "succeeded",
        owningEntityIds: { familyId: guardian.familyId },
      }),
    );
  });

  it("blocks Persona and custom-style submissions on canonical endpoint controls before fal executes", async () => {
    const personaCtx = createTestContext();
    const personaGuardian = await subscribedGuardian(personaCtx);
    new ProviderCostMeteringService(personaCtx.store).setKillSwitch({
      familyId: personaGuardian.familyId,
      scope: "endpoint",
      endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
      threshold: CostThreshold.RED,
      reason: "stop training spend",
    });

    await expect(personaCtx.personas.createAdult({
      memberId: personaGuardian.id,
      displayName: "Blocked guardian",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    })).rejects.toThrow(SpendBlockedError);
    expect(personaCtx.fal.trainCalls).toBe(0);

    const styleCtx = createTestContext();
    const styleGuardian = await subscribedGuardian(styleCtx);
    setTier(styleCtx, styleGuardian.familyId, "plus");
    new ProviderCostMeteringService(styleCtx.store).setKillSwitch({
      familyId: styleGuardian.familyId,
      scope: "endpoint",
      endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
      threshold: CostThreshold.RED,
      reason: "stop training spend",
    });

    await expect(styleCtx.customStyles.startTraining({
      familyId: styleGuardian.familyId,
      memberId: styleGuardian.id,
      referenceImages: [goodPhoto()],
      seed: "blocked style",
    })).rejects.toThrow(SpendBlockedError);
    expect(styleCtx.fal.trainCalls).toBe(0);
    expect(styleCtx.credits.getBalance(styleGuardian.familyId).customStyleIncluded).toBe(1);
  });

  it("blocks likeness images on their canonical endpoint before fal generates a derivative", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    new ProviderCostMeteringService(ctx.store).setKillSwitch({
      familyId: guardian.familyId,
      scope: "endpoint",
      endpoint: FAL_FLUX_1_LORA_ENDPOINT,
      threshold: CostThreshold.RED,
      reason: "stop image spend",
    });

    await expect(ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Blocked likeness image",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    })).rejects.toThrow(SpendBlockedError);
    expect(ctx.fal.trainCalls).toBe(1);
    expect(ctx.fal.imagePrompts).toEqual([]);
  });

  it("records failed submissions without retaining sensitive request data", async () => {
    const ctx = createTestContext({ fal: new FailingTrainingFal() });
    const guardian = await subscribedGuardian(ctx);

    await expect(ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Failed guardian",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    })).rejects.toThrow("fal training unavailable");

    setTier(ctx, guardian.familyId, "plus");
    await expect(ctx.customStyles.startTraining({
      familyId: guardian.familyId,
      memberId: guardian.id,
      referenceImages: [goodPhoto()],
      seed: "private style seed",
    })).rejects.toThrow("fal training unavailable");

    const failed = [...ctx.store.providerCostLedgerEntries.values()];
    expect(failed).toHaveLength(2);
    expect(ctx.credits.getBalance(guardian.familyId).customStyleIncluded).toBe(1);
    expect(failed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
        model: FAL_FLUX_1_LORA_MODEL,
        attemptType: "training",
        outcome: "failed",
        owningEntityIds: expect.objectContaining({ familyId: guardian.familyId }),
      }),
    ]));
    expect(JSON.stringify(failed)).not.toMatch(/photo|selfie|secret|credential|private style seed/i);
  });
});
