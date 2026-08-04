import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { R1_PLAN_DEFINITION, r1TierFromRevenueCatProduct } from "@/domain/plan";
import { FakeRevenueCat } from "@/adapters/fakes";
import { createTestContext } from "@/test/fixtures";
import {
  RevenueCatPurchaseService,
  UnresolvedRevenueCatPurchaseError,
} from "@/services/revenuecat-purchase";
import { StoryCapError } from "@/services/story-cap";
import { RevenueCatPurchaseController } from "../mobile/lib/purchase-controller";

type TestContext = ReturnType<typeof createTestContext>;
const routeHarness = vi.hoisted(() => ({ ctx: null as TestContext | null }));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => {
    if (!routeHarness.ctx) throw new Error("route test context is missing");
    return routeHarness.ctx;
  },
}));

import { POST as revenueCatWebhook } from "@/app/api/webhooks/revenuecat/route";

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "rc-event-194-initial",
    type: "INITIAL_PURCHASE",
    appUserId: "family-194",
    productId: `${R1_PLAN_DEFINITION.plan}_monthly`,
    subscriptionId: "rc-transaction-194",
    ...overrides,
  };
}

function service(ctx: ReturnType<typeof createTestContext>, adapter = new FakeRevenueCat()) {
  return new RevenueCatPurchaseService(ctx.store, ctx.subscriptions, adapter, ctx.entitlements);
}

function guardian(ctx: ReturnType<typeof createTestContext>, auth = "auth-194") {
  return ctx.onboarding.ensureFamilyForNewUser(auth, `${auth}@example.com`);
}

function purchaseAdapterWithRestore(
  adapter: FakeRevenueCat,
  evidence: { tier: string; isTrial: boolean; verified: boolean; productId: string; subscriptionId: string }
) {
  return Object.assign(adapter, { restorePurchases: async () => evidence });
}

describe("194 — RevenueCat lifecycle at the server seam", () => {
  beforeEach(() => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "rc-secret";
  });

  afterEach(() => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    delete process.env.R1_MULTI_FAMILY_ENABLED;
    delete process.env.R1_ONE_PLAN;
    routeHarness.ctx = null;
  });

  it("route verifies the signature and persists through one hydrated context", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-route");
    let persistCount = 0;
    const persist = ctx.persist.bind(ctx);
    ctx.persist = async () => {
      persistCount += 1;
      await persist();
    };
    routeHarness.ctx = ctx;

    const response = await revenueCatWebhook(
      new Request("https://example.test/api/webhooks/revenuecat", {
        method: "POST",
        headers: { authorization: "Bearer rc-secret" },
        body: JSON.stringify({
          event: {
            id: "rc-route-194",
            type: "INITIAL_PURCHASE",
            app_user_id: member.familyId,
            product_id: `${R1_PLAN_DEFINITION.plan}_monthly`,
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(persistCount).toBe(1);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);
    expect([...ctx.store.moderationAudit.values()]).toHaveLength(1);
  });

  it("rejects a forged webhook before parsing or persisting", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-forged");
    let persistCount = 0;
    const persist = ctx.persist.bind(ctx);
    ctx.persist = async () => {
      persistCount += 1;
      await persist();
    };
    routeHarness.ctx = ctx;

    const response = await revenueCatWebhook(
      new Request("https://example.test/api/webhooks/revenuecat", {
        method: "POST",
        headers: { authorization: "Bearer forged" },
        body: "not-json",
      })
    );

    expect(response.status).toBe(401);
    expect(persistCount).toBe(0);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("returns success for a known lifecycle event even when it only deactivates a Family", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-route-refund");
    routeHarness.ctx = ctx;

    const response = await revenueCatWebhook(
      new Request("https://example.test/api/webhooks/revenuecat", {
        method: "POST",
        headers: { authorization: "Bearer rc-secret" },
        body: JSON.stringify({
          event: {
            id: "rc-route-194-refund",
            type: "REFUND",
            app_user_id: member.familyId,
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(ctx.store.getSubscription(member.familyId)?.status).toBe("canceled");
  });

  it("native purchase waits for server verification before returning success", async () => {
    const calls: string[] = [];
    const controller = new RevenueCatPurchaseController({
      nativePurchases: {
        purchase: async () => { calls.push("purchase"); },
        restorePurchases: async () => { calls.push("restore"); },
      },
      productId: `${R1_PLAN_DEFINITION.plan}_monthly`,
      startTrialRequest: async () => ({ isActive: false, trialEndsAt: null, entitlement: null }),
      fetchEntitlement: async () => ({
        plan: R1_PLAN_DEFINITION,
        usage: { storybooks: { count: 0, remaining: 4, resetDate: "2026-08-01" } },
      }),
      fetchVerifiedPurchase: async () => ({
        ok: false,
        error: "Purchase is pending server verification",
      }),
    });

    const result = await controller.startTrial();
    expect(result).toMatchObject({ ok: false });
    expect(calls).toEqual(["purchase"]);
  });

  it("native restore uses the same server-verification boundary", async () => {
    const calls: string[] = [];
    const controller = new RevenueCatPurchaseController({
      nativePurchases: {
        purchase: async () => { calls.push("purchase"); },
        restorePurchases: async () => { calls.push("restore"); },
      },
      productId: `${R1_PLAN_DEFINITION.plan}_monthly`,
      startTrialRequest: async () => ({ isActive: false, trialEndsAt: null, entitlement: null }),
      fetchEntitlement: async () => ({
        plan: R1_PLAN_DEFINITION,
        usage: { storybooks: { count: 0, remaining: 4, resetDate: "2026-08-01" } },
      }),
      fetchVerifiedPurchase: async () => ({
        ok: true,
        isActive: true,
        trialEndsAt: null,
        entitlement: {
          plan: R1_PLAN_DEFINITION,
          usage: { storybooks: { count: 0, remaining: 4, resetDate: "2026-08-01" } },
        },
      }),
    });

    const result = await controller.restorePurchases();
    expect(result).toMatchObject({ ok: true, isActive: true });
    expect(calls).toEqual(["restore"]);
  });

  it("activates a Family only from a verified lifecycle event", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx);
    const result = await service(ctx).handleWebhookEvent({ ...event(), appUserId: member.familyId });

    expect(result).toMatchObject({ ok: true, duplicate: false, action: "activated" });
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);
    expect(ctx.store.getSubscription(member.familyId)?.tier).toBe("normal");
  });

  it("rejects missing and unknown R1 products before entitlement activation", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-products");
    const purchase = service(ctx);

    await purchase.handleWebhookEvent(event({ appUserId: member.familyId, productId: undefined }));
    await purchase.handleWebhookEvent(event({ appUserId: member.familyId, eventId: "unknown-product", productId: "just_us_free" }));

    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
    expect(r1TierFromRevenueCatProduct("just_us_monthly")).toBe("normal");
    expect(r1TierFromRevenueCatProduct("just_us_free")).toBeUndefined();
    expect(r1TierFromRevenueCatProduct(undefined)).toBeUndefined();
  });

  it("does not activate an already-expired verified lifecycle event", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-expired-event");
    const result = await service(ctx).handleWebhookEvent(event({
      appUserId: member.familyId,
      eventId: "expired-initial",
      expirationAtMs: Date.now() - 1,
    }));

    expect(result).toMatchObject({ ok: true, action: "ignored" });
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("does not unlock a paid action for an unresolved native purchase", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-unresolved");
    const adapter = new FakeRevenueCat();
    adapter.purchase = async () => ({ entitlementId: "", isTrial: false, verified: false });

    await expect(
      service(ctx, adapter).purchase(member.familyId, "normal", { hasPaymentMethod: true })
    ).rejects.toBeInstanceOf(UnresolvedRevenueCatPurchaseError);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("does not activate the requested tier when verified product evidence names another tier", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-product-tier");
    const adapter = new FakeRevenueCat();
    adapter.purchase = async () => ({
      entitlementId: "rc-entitlement-194",
      isTrial: false,
      verified: true,
      productId: `${R1_PLAN_DEFINITION.plan}_monthly`,
    });

    await expect(
      service(ctx, adapter).purchase(member.familyId, "plus", { hasPaymentMethod: true })
    ).rejects.toBeInstanceOf(UnresolvedRevenueCatPurchaseError);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("deduplicates event IDs and binds app_user_id to the owning Family", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-dedupe");
    const purchase = service(ctx);
    const first = await purchase.handleWebhookEvent({ ...event(), appUserId: member.familyId });
    const replay = await purchase.handleWebhookEvent({ ...event(), appUserId: member.familyId });

    expect(first.duplicate).toBe(false);
    expect(replay).toMatchObject({ ok: true, duplicate: true });
    expect(
      [...ctx.store.moderationAudit.values()].filter(
        (entry) => entry.resourceType === "revenuecat_lifecycle"
      )
    ).toHaveLength(1);

    const foreign = await purchase.handleWebhookEvent(event({ appUserId: "not-a-family" }));
    expect(foreign).toMatchObject({ ok: false, duplicate: false });
    expect(ctx.store.subscriptions.has("not-a-family")).toBe(false);

    const concurrent = await Promise.all([
      purchase.handleWebhookEvent(event({ appUserId: member.familyId, eventId: "concurrent" })),
      purchase.handleWebhookEvent(event({ appUserId: member.familyId, eventId: "concurrent" })),
    ]);
    expect(concurrent.filter((result) => result.duplicate)).toHaveLength(1);
    expect([...ctx.store.moderationAudit.values()].filter((entry) => entry.resourceId === "concurrent")).toHaveLength(1);
  });

  it("handles refund, billing issue, expiration, cancellation, product change, uncancellation, and restore explicitly", async () => {
    const cases = [
      { type: "REFUND", expected: "canceled" },
      { type: "BILLING_ISSUE", expected: "past_due" },
      { type: "EXPIRATION", expected: "canceled" },
      { type: "CANCELLATION", expected: "canceled" },
      { type: "PRODUCT_CHANGE", expected: "active" },
      { type: "UNCANCELLATION", expected: "active" },
      { type: "RESTORE", expected: "active" },
    ] as const;

    for (const [index, current] of cases.entries()) {
      const ctx = createTestContext();
      const member = guardian(ctx, `auth-194-${index}`);
      const result = await service(ctx).handleWebhookEvent(
        event({
          eventId: `rc-event-194-${current.type}`,
          appUserId: member.familyId,
          type: current.type,
        })
      );

      expect(result).toMatchObject({
        ok: true,
        action: current.expected === "active" ? "activated" : "deactivated",
      });
      expect(ctx.store.getSubscription(member.familyId)?.status).toBe(current.expected);
    }
  });

  it("keeps access through a future cancellation expiry and expires persisted access", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-expiry");
    const purchase = service(ctx);
    await purchase.handleWebhookEvent(event({
      appUserId: member.familyId,
      eventId: "future-cancel",
      type: "CANCELLATION",
      expirationAtMs: Date.now() + 60_000,
    }));

    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);
    const subscription = ctx.store.getSubscription(member.familyId)!;
    ctx.store.saveSubscription({ ...subscription, expiresAt: new Date(Date.now() - 1) });
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("ignores an out-of-order lifecycle event without resurrecting entitlement", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-order");
    const purchase = service(ctx);

    await purchase.handleWebhookEvent(
      event({ appUserId: member.familyId, eventId: "newer", eventTimestampMs: 200 })
    );
    const stale = await purchase.handleWebhookEvent(
      event({
        appUserId: member.familyId,
        eventId: "older",
        type: "EXPIRATION",
        eventTimestampMs: 100,
      })
    );

    expect(stale).toMatchObject({ ok: true, action: "ignored" });
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);
  });

  it("restore rehydrates entitlement from verified RevenueCat evidence", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-restore");
    const adapter = new FakeRevenueCat();
    const restoreAdapter = purchaseAdapterWithRestore(adapter, {
      tier: "normal",
      isTrial: false,
      verified: true,
      productId: `${R1_PLAN_DEFINITION.plan}_monthly`,
      subscriptionId: "rc-restored-194",
    });
    const restoringPurchase = service(ctx, restoreAdapter);

    const restored = await restoringPurchase.restorePurchases(member.familyId);

    expect(restored).toMatchObject({ degraded: false });
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);
    expect(ctx.store.getSubscription(member.familyId)?.stripeSubscriptionId).toBe("rc-restored-194");
  });

  it("rejects a webhook without a durable event id", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-no-event-id");
    routeHarness.ctx = ctx;
    const response = await revenueCatWebhook(
      new Request("https://example.test/api/webhooks/revenuecat", {
        method: "POST",
        headers: { authorization: "Bearer rc-secret" },
        body: JSON.stringify({ event: { type: "INITIAL_PURCHASE", app_user_id: member.familyId, product_id: "just_us_monthly" } }),
      }),
    );
    expect(response.status).toBe(400);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("bounds a trial Family to the canonical shared Story allowance", async () => {
    const ctx = createTestContext();
    const member = guardian(ctx, "auth-194-cap");
    const purchase = service(ctx);
    await purchase.handleWebhookEvent(
      event({ appUserId: member.familyId, eventId: "trial", isTrial: true })
    );

    for (let index = 0; index < R1_PLAN_DEFINITION.limits.storybooksPerMonth; index += 1) {
      ctx.storyCap.reserve(member.familyId, member.id, `trial-book-${index}`);
    }

    expect(() => ctx.storyCap.reserve(member.familyId, member.id, "trial-book-over-cap"))
      .toThrow(StoryCapError);
  });
});
