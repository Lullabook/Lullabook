import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";
import { EntitlementError, PLAN_ENTITLEMENTS, tierToPlan } from "@/services/entitlement";

/**
 * Issues 116 + 117 — Two-plan entitlement model + per-member create-rights gate.
 */
describe("116/117 — two-plan entitlement + create-rights", () => {
  it("PLAN_ENTITLEMENTS has the correct caps per ADR-0025", () => {
    expect(PLAN_ENTITLEMENTS.just_us.storyCap).toBe(8);
    expect(PLAN_ENTITLEMENTS.just_us.memberLoginCap).toBe(2);
    expect(PLAN_ENTITLEMENTS.just_us.canNarrate).toBe(false);
    expect(PLAN_ENTITLEMENTS.just_us.canVideo).toBe(false);

    expect(PLAN_ENTITLEMENTS.our_whole_family.storyCap).toBe(20);
    expect(PLAN_ENTITLEMENTS.our_whole_family.memberLoginCap).toBe(Infinity);
    expect(PLAN_ENTITLEMENTS.our_whole_family.canNarrate).toBe(true);
    expect(PLAN_ENTITLEMENTS.our_whole_family.canVideo).toBe(true);
  });

  it("memberLoginCap is distinct from the likeness memberCap", () => {
    expect(PLAN_ENTITLEMENTS.just_us.memberLoginCap).not.toBe(
      PLAN_ENTITLEMENTS.just_us.memberCap
    );
  });

  it("tierToPlan maps Basic/Normal → just_us, Plus → our_whole_family", () => {
    expect(tierToPlan("basic")).toBe("just_us");
    expect(tierToPlan("normal")).toBe("just_us");
    expect(tierToPlan("plus")).toBe("our_whole_family");
    expect(tierToPlan(undefined)).toBe("just_us");
  });

  it("getPlanEntitlement returns Just Us for an active normal subscription", () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-116", "g@example.com");
    withActiveSubscription(ctx, member);
    const sub = ctx.store.getSubscription(member.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "normal", updatedAt: new Date() });

    const ent = ctx.entitlements.getPlanEntitlement(member.familyId);
    expect(ent.plan).toBe("just_us");
    expect(ent.storyCap).toBe(8);
  });

  it("getPlanEntitlement returns Our Whole Family for a Plus subscription", () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-116b", "g@example.com");
    withActiveSubscription(ctx, member);
    const sub = ctx.store.getSubscription(member.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });

    const ent = ctx.entitlements.getPlanEntitlement(member.familyId);
    expect(ent.plan).toBe("our_whole_family");
  });

  it("requireMemberLoginSlot enforces the login cap (403 over cap)", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-116c", "g@example.com");
    withActiveSubscription(ctx, guardian);
    // Just Us: login cap = 2 (parent + co-parent). Guardian is 1, invite 1 more
    // → 2 members. A 3rd should fail.
    const { token } = ctx.family.inviteMember(guardian.id, "a@example.com");
    ctx.family.acceptInvite(token, "auth-a");

    expect(() => ctx.entitlements.requireMemberLoginSlot(guardian.familyId)).toThrow(
      /login cap/i
    );
  });

  it("requireMemberLoginSlot is unlimited on Our Whole Family", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-116d", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const sub = ctx.store.getSubscription(guardian.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });

    // Invite several members — should never hit a cap
    for (let i = 0; i < 5; i++) {
      const { token } = ctx.family.inviteMember(guardian.id, `m${i}@example.com`);
      ctx.family.acceptInvite(token, `auth-m${i}`);
    }
    expect(() => ctx.entitlements.requireMemberLoginSlot(guardian.familyId)).not.toThrow();
  });

  // Issue 117 — per-member create-rights gate
  it("requireCanCreate blocks non-Guardian on Just Us (403)", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-117", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const { token } = ctx.family.inviteMember(guardian.id, "member@example.com");
    const member = ctx.family.acceptInvite(token, "auth-member");

    expect(() =>
      ctx.entitlements.requireCanCreate(guardian.familyId, member.id)
    ).toThrow(/guardian/i);
  });

  it("requireCanCreate allows the Guardian on Just Us", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-117b", "g@example.com");
    withActiveSubscription(ctx, guardian);

    expect(() =>
      ctx.entitlements.requireCanCreate(guardian.familyId, guardian.id)
    ).not.toThrow();
  });

  it("requireCanCreate allows any Member on Our Whole Family", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-117c", "g@example.com");
    withActiveSubscription(ctx, guardian);
    const sub = ctx.store.getSubscription(guardian.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });
    const { token } = ctx.family.inviteMember(guardian.id, "member@example.com");
    const member = ctx.family.acceptInvite(token, "auth-member");

    expect(() =>
      ctx.entitlements.requireCanCreate(guardian.familyId, member.id)
    ).not.toThrow();
  });
});
