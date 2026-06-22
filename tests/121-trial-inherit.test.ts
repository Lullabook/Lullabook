import { describe, expect, it } from "vitest";
import { createTestContext, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 121 — Trial-of-Family + RevenueCat/Stripe product mapping + inherit-on-login.
 */
describe("121 — trial + inherit + product mapping", () => {
  it("the trial activates the full (Our Whole Family) experience", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-121", "g@example.com");

    // Start a trial — should activate the full experience (Our Whole Family = plus tier)
    await ctx.revenuecatPurchases.startTrial(guardian.familyId, "plus", {
      hasPaymentMethod: true,
    });

    // The subscription should be active
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);

    // The plan should be Our Whole Family
    const plan = ctx.entitlements.getPlan(guardian.familyId);
    expect(plan).toBe("our_whole_family");
  });

  it("trial requires card-on-file (VPC gate)", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-121b", "g@example.com");

    await expect(
      ctx.revenuecatPurchases.startTrial(guardian.familyId, "plus", {
        hasPaymentMethod: false,
      })
    ).rejects.toThrow(/payment method/i);
  });

  it("invited Members inherit the Household plan on login (no own purchase)", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-121c", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const sub = ctx.store.getSubscription(guardian.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });

    // Invite a grandparent
    const { token } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    const grandma = ctx.family.acceptInvite(token, "auth-gma");

    // The grandparent inherits the Household plan — no purchase of their own
    const plan = ctx.entitlements.getPlan(grandma.familyId);
    expect(plan).toBe("our_whole_family");

    // The grandparent can create (Our Whole Family = everyone creates)
    expect(() =>
      ctx.entitlements.requireCanCreate(grandma.familyId, grandma.id)
    ).not.toThrow();
  });

  it("webhook activation is idempotent + Household-keyed", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-121d", "g@example.com");

    // First activation
    await ctx.revenuecatPurchases.purchase(guardian.familyId, "plus", {
      hasPaymentMethod: true,
    });
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);

    // Second activation (replay) — should be idempotent, not throw
    await ctx.revenuecatPurchases.purchase(guardian.familyId, "plus", {
      hasPaymentMethod: true,
    });
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(true);
  });
});
