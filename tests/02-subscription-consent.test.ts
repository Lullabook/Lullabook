import { describe, expect, it } from "vitest";
import { ConsentEngine } from "@/services/consent-engine";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("02 — subscription + consent gate", () => {
  it("starts Stripe Checkout and reflects active status via webhook", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-sub", "sub@example.com");

    const session = await ctx.subscriptions.startCheckout(member.familyId);
    expect(session.url).toContain("stripe.com");

    ctx.subscriptions.handleCheckoutCompleted(member.familyId, "cus_1", "sub_1");
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);
  });

  it("ConsentEngine.check is table-driven across jurisdictions", () => {
    const engine = new ConsentEngine();

    expect(
      engine.check({
        jurisdiction: "US",
        actorRole: "guardian",
        action: "create_baby_persona",
        hasActiveSubscription: true,
        hasConsentReceipt: true,
      }).allowed
    ).toBe(true);

    expect(
      engine.check({
        jurisdiction: "IN",
        actorRole: "guardian",
        action: "create_baby_persona",
        hasActiveSubscription: true,
        hasConsentReceipt: false,
      }).allowed
    ).toBe(false);

    expect(engine.childAgeThreshold("US")).toBe(13);
    expect(engine.childAgeThreshold("IN")).toBe(18);
  });

  it("blocks Baby Persona creation without active subscription", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-baby", "baby@example.com");
    ctx.subscriptions.recordConsent(member.familyId, member.id, "US");

    await expect(
      ctx.personas.createBaby({
        memberId: member.id,
        displayName: "Luna",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      })
    ).rejects.toThrow(/subscription/i);
  });

  it("records consent receipt and allows baby creation when subscribed", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-consent", "consent@example.com");
    ctx.subscriptions.handleCheckoutCompleted(member.familyId, "cus_2", "sub_2");
    ctx.subscriptions.recordConsent(member.familyId, member.id, "US");

    const persona = await ctx.personas.createBaby({
      memberId: member.id,
      displayName: "Milo",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    expect(persona.kind).toBe("baby");
  });

  it("updates status on cancel and schedules purge window", () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-cancel", "cancel@example.com");
    ctx.subscriptions.handleCheckoutCompleted(member.familyId, "cus_3", "sub_3");
    ctx.subscriptions.cancel(member.familyId);

    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
    expect(ctx.store.purgeScheduled.has(member.familyId)).toBe(true);
  });
});
