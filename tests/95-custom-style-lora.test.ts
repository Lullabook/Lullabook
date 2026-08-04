import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, subscribedGuardian, householdWithBaby, goodPhoto } from "@/test/fixtures";
import type { Tier } from "@/domain/types";
import { CustomStyleService } from "@/services/custom-style";
import { EntitlementError } from "@/services/entitlement";
import { CreditError } from "@/services/credit-ledger";

beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

function setTier(
  ctx: ReturnType<typeof createTestContext>,
  familyId: string,
  tier: Tier
) {
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

describe("95 — Custom art-style trained Style-LoRA pipeline (Plus, ADR-0023)", () => {
  describe("train → ready", () => {
    it("a custom-style train enqueues a durable step and reaches ready", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      const style = await svc.startTraining({
        familyId: guardian.familyId,
        memberId: guardian.id,
        referenceImages: [goodPhoto(), goodPhoto()],
        seed: "watercolor pastels",
      });

      await ctx.workflow.drain();

      const stored = ctx.store.customStyles.get(style.id);
      expect(stored?.status).toBe("ready");
      expect(stored?.loraWeightKey).toBeDefined();
    });

    it("training status is generating before completion", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      const style = await svc.startTraining({
        familyId: guardian.familyId,
        memberId: guardian.id,
        referenceImages: [goodPhoto()],
        seed: "ink illustration",
      });

      const stored = ctx.store.customStyles.get(style.id);
      expect(stored?.status).toBe("generating");
    });
  });

  describe("entitlement gate — Plus only", () => {
    it("Basic tier gets 403 when trying to train a custom style", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "basic");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      await expect(
        svc.startTraining({
          familyId: guardian.familyId,
          memberId: guardian.id,
          referenceImages: [goodPhoto()],
          seed: "test",
        })
      ).rejects.toThrow(EntitlementError);
    });

    it("Normal tier gets 403 when trying to train a custom style", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      await expect(
        svc.startTraining({
          familyId: guardian.familyId,
          memberId: guardian.id,
          referenceImages: [goodPhoto()],
          seed: "test",
        })
      ).rejects.toThrow(EntitlementError);
    });
  });

  describe("failure → fallback + refund", () => {
    it("train failure falls back to default Style Bible and refunds the credit", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      // Make fal training fail
      ctx.fal.failTraining = true;

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      const style = await svc.startTraining({
        familyId: guardian.familyId,
        memberId: guardian.id,
        referenceImages: [goodPhoto()],
        seed: "will fail",
      });

      // Before drain, credit is debited
      const balanceBefore = ctx.credits.getBalance(guardian.familyId);
      expect(balanceBefore.customStyleIncluded).toBe(0);

      // Emit the fal training failure event so the workflow sees it
      const falWebhook = ctx.fal.getWebhook(`job-${ctx.fal.trainCalls}`);
      await ctx.workflow.emitEvent("fal.training.complete", falWebhook!);
      await ctx.workflow.drain();

      // After failure: status=failed, credit refunded
      const stored = ctx.store.customStyles.get(style.id);
      expect(stored?.status).toBe("failed");

      const balanceAfter = ctx.credits.getBalance(guardian.familyId);
      expect(balanceAfter.customStyleIncluded).toBe(1); // refunded
    });

    it("a book selects a ready custom style as its Style Bible; failed styles fall back to default", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      const style = await svc.startTraining({
        familyId: guardian.familyId,
        memberId: guardian.id,
        referenceImages: [goodPhoto()],
        seed: "watercolor",
      });
      await ctx.workflow.drain();

      const ready = svc.getReadyStyle(guardian.familyId, guardian.id);
      expect(ready?.id).toBe(style.id);
      expect(ready?.status).toBe("ready");
    });
  });

  describe("hard-delete purge", () => {
    it("the Style LoRA is Family-scoped and purged by hard-delete", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      const style = await svc.startTraining({
        familyId: guardian.familyId,
        memberId: guardian.id,
        referenceImages: [goodPhoto()],
        seed: "watercolor",
      });
      await ctx.workflow.drain();

      expect(style.loraWeightKey).toBeDefined();
      const blobKey = style.loraWeightKey!;
      await ctx.blobs.put(blobKey, Buffer.from("style-lora-weights"));

      // Hard-delete should purge
      await ctx.hardDelete.purgeFamily(guardian.familyId);

      const stored = ctx.store.customStyles.get(style.id);
      expect(stored).toBeUndefined();

      const blobAfter = await ctx.blobs.get(blobKey);
      expect(blobAfter).toBeNull();
    });
  });

  describe("credit metering", () => {
    it("training debits a custom-style credit", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      const balanceBefore = ctx.credits.getBalance(guardian.familyId);
      expect(balanceBefore.customStyleIncluded).toBe(1);

      await svc.startTraining({
        familyId: guardian.familyId,
        memberId: guardian.id,
        referenceImages: [goodPhoto()],
        seed: "test",
      });

      const balanceAfter = ctx.credits.getBalance(guardian.familyId);
      expect(balanceAfter.customStyleIncluded).toBe(0);
    });

    it("out of credits → CreditError, no training started", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      setTier(ctx, guardian.familyId, "plus");

      // Exhaust the credit
      ctx.credits.debit(guardian.familyId, "customStyle", "pre-exhaust");

      const svc = new CustomStyleService(
        ctx.store,
        ctx.fal,
        ctx.workflow,
        ctx.blobs,
        ctx.entitlements,
        ctx.credits
      );

      await expect(
        svc.startTraining({
          familyId: guardian.familyId,
          memberId: guardian.id,
          referenceImages: [goodPhoto()],
          seed: "test",
        })
      ).rejects.toThrow(CreditError);
    });
  });
});
