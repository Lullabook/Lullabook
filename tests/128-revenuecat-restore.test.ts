import { describe, expect, it } from "vitest";
import {
  createTestContext,
  subscribedGuardian,
} from "@/test/fixtures";
import { RevenueCatPurchaseService } from "@/services/revenuecat-purchase";
import { FakeRevenueCat } from "@/adapters/fakes";

/**
 * Issue 128 — RevenueCat IAP: the remaining R1 gaps.
 *
 * Trial→entitlement mapping, VPC card-on-file gate, outage degrade, and the
 * <300ms cached check are covered by test 92. This pins the two invariants the
 * audit flagged as untested: (a) purchase failure → entitlement does NOT flip;
 * (b) restore-purchases re-syncs the entitlement server-side.
 */

function svc(ctx: ReturnType<typeof createTestContext>, rc?: FakeRevenueCat) {
  return new RevenueCatPurchaseService(
    ctx.store,
    ctx.subscriptions,
    rc ?? new FakeRevenueCat(),
    ctx.entitlements
  );
}

function clearSub(ctx: ReturnType<typeof createTestContext>, familyId: string) {
  ctx.store.saveSubscription({
    familyId,
    status: "none",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    updatedAt: new Date(),
  });
}

describe("128 — RevenueCat purchase-failure + restore-purchases", () => {
  it("a failed purchase does NOT flip the entitlement (invariant)", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    clearSub(ctx, guardian.familyId);

    const rc = new FakeRevenueCat();
    // Sabotage the adapter so purchase throws (Apple IAP transaction fails).
    rc.purchase = async () => {
      throw new Error("IAP transaction cancelled");
    };
    const purchaseSvc = svc(ctx, rc);

    await expect(
      purchaseSvc.purchase(guardian.familyId, "normal", { hasPaymentMethod: true })
    ).rejects.toThrow(/IAP transaction cancelled/);

    // Entitlement did not flip — the household is still not active.
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
    const sub = ctx.store.getSubscription(guardian.familyId);
    expect(sub?.status).toBe("none");
  });

  it("a failed trial start does NOT flip the entitlement", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    clearSub(ctx, guardian.familyId);

    const rc = new FakeRevenueCat();
    rc.startTrial = async () => {
      throw new Error("Trial start failed (no card)");
    };
    const purchaseSvc = svc(ctx, rc);

    await expect(
      purchaseSvc.startTrial(guardian.familyId, "normal", { hasPaymentMethod: true })
    ).rejects.toThrow(/Trial start failed/);

    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
  });

  it("restore-purchases re-syncs the entitlement server-side after a lapse", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    // User had a Normal trial, then lapsed (sub cleared).
    const rc = new FakeRevenueCat();
    const purchaseSvc = svc(ctx, rc);
    clearSub(ctx, guardian.familyId);
    await purchaseSvc.startTrial(guardian.familyId, "normal", { hasPaymentMethod: true });
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);

    // Simulate a lapse (e.g. app reinstall with no cached sub).
    clearSub(ctx, guardian.familyId);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);

    // Restore: RevenueCat still reports the active entitlement → server re-flips.
    const restored = await purchaseSvc.syncEntitlement(guardian.familyId);
    expect(restored.degraded).toBe(false);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
    const sub = ctx.store.getSubscription(guardian.familyId);
    expect(sub?.tier).toBe("normal");
  });

  it("restore when there is genuinely no purchase degrades gracefully", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    clearSub(ctx, guardian.familyId);

    const rc = new FakeRevenueCat();
    // fetchEntitlement returns null (no purchase found).
    const purchaseSvc = svc(ctx, rc);

    const result = await purchaseSvc.syncEntitlement(guardian.familyId);
    expect(result.degraded).toBe(true);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
  });
});
