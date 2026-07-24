import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import {
  LEGACY_TIER_COMPATIBILITY,
  R1_PLAN_DEFINITION,
  legacyTierToPlan,
} from "@/domain/plan";
import { PLAN_ENTITLEMENTS } from "@/services/entitlement";
import { getR1VisiblePlans } from "@/lib/paywall-config";

const ROOT = process.cwd();

afterEach(() => {
  delete process.env.R1_MULTI_FAMILY_ENABLED;
  delete process.env.R1_ONE_PLAN;
});

describe("177 — accepted R1 Family and Just Us plan invariants", () => {
  it("allows a mixed Baby/Adult roster up to three Personas and rejects the fourth before writes or training", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);

    const babyOne = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(1), goodPhoto(2), goodPhoto(3)],
    });
    ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const babyTwo = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Leo",
      photos: [goodPhoto(4), goodPhoto(5), goodPhoto(6)],
    });
    ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });
    const adult = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Guardian",
      photos: [goodPhoto(7), goodPhoto(8), goodPhoto(9)],
      selfie: Buffer.from("selfie"),
    });

    expect([babyOne.kind, babyTwo.kind, adult.kind]).toEqual(["baby", "baby", "adult"]);
    expect(ctx.store.personas.size).toBe(3);
    const trainCallsBeforeFourth = ctx.fal.trainCalls;

    await expect(
      ctx.personas.createAdult({
        memberId: guardian.id,
        displayName: "Fourth",
        photos: [goodPhoto(10), goodPhoto(11), goodPhoto(12)],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/persona cap|3/i);

    expect(ctx.store.personas.size).toBe(3);
    expect(ctx.fal.trainCalls).toBe(trainCallsBeforeFourth);
    expect(ctx.babies.list(guardian.id)).toHaveLength(2);
  });

  it("keeps the Persona cap type-neutral and the Story allowance shared rather than per-Persona", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const baby = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Baby",
      photos: [goodPhoto(13), goodPhoto(14), goodPhoto(15)],
    });
    const adult = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Adult",
      photos: [goodPhoto(16), goodPhoto(17), goodPhoto(18)],
      selfie: Buffer.from("selfie"),
    });

    expect(baby.kind).not.toBe(adult.kind);
    expect(ctx.entitlements.getPlanEntitlement(guardian.familyId).memberCap).toBe(
      R1_PLAN_DEFINITION.limits.personas
    );
    expect(ctx.storyCap.getUsage(guardian.familyId, guardian.id)).toMatchObject({
      cap: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
      count: 0,
      remaining: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
    });
  });

  it("permits Adult Members to create only their own Adult Persona while Baby creation remains Guardian-only", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const sub = ctx.store.getSubscription(guardian.familyId)!;
    ctx.store.saveSubscription({ ...sub, tier: "plus", updatedAt: new Date() });
    const { token } = ctx.family.inviteMember(guardian.id, "member@example.com");
    const member = ctx.family.acceptInvite(token, "auth-member");

    expect(() => ctx.entitlements.requireCanCreate(guardian.familyId, guardian.id)).not.toThrow();
    expect(() => ctx.entitlements.requireCanCreate(guardian.familyId, member.id, "adult-persona")).not.toThrow();
    expect(() => ctx.entitlements.requireCanCreate(guardian.familyId, member.id, "baby-persona")).toThrow(/guardian/i);

    const inviteRoute = await import("@/app/api/family/invite/route");
    const acceptRoute = await import("@/app/api/family/accept/route");
    expect((await inviteRoute.POST(new Request("https://x/api/family/invite", { method: "POST" }))).status).toBe(404);
    expect((await acceptRoute.POST(new Request("https://x/api/family/accept", { method: "POST" }))).status).toBe(404);
  });

  it("allows an Adult Member's self-owned Adult Persona but not Baby creation", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const { token } = ctx.family.inviteMember(guardian.id, "member@example.com");
    const member = ctx.family.acceptInvite(token, "auth-member");

    const adult = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Self-owned",
      photos: [goodPhoto(70), goodPhoto(71), goodPhoto(72)],
      selfie: Buffer.from("selfie"),
    });

    expect(ctx.personas.acceptLikeness(adult.id, member.id).likenessConfirmed).toBe(true);
    expect(() => ctx.personas.acceptLikeness(adult.id, guardian.id)).toThrow(/adult|subject|self/i);
    await expect(ctx.personas.createBaby({
      memberId: member.id,
      displayName: "Not allowed",
      photos: [goodPhoto(73), goodPhoto(74), goodPhoto(75)],
    })).rejects.toThrow(/guardian/i);
  });

  it("releases a reserved Story allowance when the generation watchdog expires", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(73), goodPhoto(74), goodPhoto(75)],
      selfie: Buffer.from("selfie"),
    });
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "watchdog",
    });

    expect(ctx.storyCap.getReservation(book.id)?.status).toBe("reserved");
    expect(ctx.storybooks.reapStrandedGenerations(new Date(book.createdAt.getTime() + 1), 0)).toBe(1);
    expect(ctx.storyCap.getReservation(book.id)).toBeUndefined();
    expect(ctx.storyCap.getReservationAudit(book.id)?.status).toBe("released");
  });

  it("has one server-authoritative R1 definition across entitlement, paywall, API, and native usage copy", () => {
    expect(R1_PLAN_DEFINITION).toMatchObject({
      plan: "just_us",
      pricing: { monthly: 14.99, annual: 119.99, annualDefault: true },
      limits: { storybooksPerMonth: 4, personas: 3, starringPersonas: 3, memberLogins: 1 },
    });
    expect(PLAN_ENTITLEMENTS.just_us).toMatchObject({
      storyCap: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
      memberCap: R1_PLAN_DEFINITION.limits.personas,
      memberLoginCap: R1_PLAN_DEFINITION.limits.memberLogins,
    });

    const [visible] = getR1VisiblePlans();
    expect(getR1VisiblePlans()).toHaveLength(1);
    expect(visible).toMatchObject({
      id: R1_PLAN_DEFINITION.plan,
      monthlyPrice: R1_PLAN_DEFINITION.pricing.monthly,
      annualPrice: R1_PLAN_DEFINITION.pricing.annual,
      storyCap: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
      memberCap: R1_PLAN_DEFINITION.limits.personas,
      starringPersonaCap: R1_PLAN_DEFINITION.limits.starringPersonas,
    });

    const entitlementRoute = readFileSync(join(ROOT, "src/app/api/entitlement/route.ts"), "utf8");
    const mobileBilling = readFileSync(join(ROOT, "mobile/app/billing.tsx"), "utf8");
    expect(entitlementRoute).toContain("R1_PLAN_DEFINITION");
    expect(entitlementRoute).toContain("starringPersonas");
    expect(mobileBilling).toContain("14.99");
    expect(mobileBilling).toContain("119.99");
    // Story cap renders from the server-provided plan; the offline fallback
    // must mirror the accepted 4-Storybook cap.
    expect(mobileBilling).toContain("Storybooks per month");
    expect(mobileBilling).toContain("storyCap: 4");
    expect(mobileBilling).toContain("3 trained Personas");
    expect(mobileBilling).toContain("3 starring Personas");
    // Legacy prices must be gone. ("9.99" alone would false-positive as a
    // substring of the accepted "119.99", so match the legacy tokens exactly.)
    expect(mobileBilling).not.toContain(" 9.99");
    expect(mobileBilling).not.toContain(": 9.99");
    expect(mobileBilling).not.toContain("79.99");
  });

  it("enforces at most three starring Personas per Storybook", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const personas = [];
    for (let i = 0; i < 3; i++) {
      personas.push(await ctx.personas.createAdult({
        memberId: guardian.id,
        displayName: `Adult ${i}`,
        photos: [goodPhoto(20 + i), goodPhoto(30 + i), goodPhoto(40 + i)],
        selfie: Buffer.from("selfie"),
      }));
    }

    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [personas[0].id, personas[1].id, personas[2].id, personas[0].id],
        storyType: "bedtime",
        theme: "too many stars",
      })
    ).rejects.toThrow(/starring|3/i);
    expect(ctx.store.storybooks.size).toBe(0);
  });

  it("reserves allowance at enqueue, commits after valid text, releases text failures, and does not charge Page repair", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Star",
      photos: [goodPhoto(50), goodPhoto(51), goodPhoto(52)],
      selfie: Buffer.from("selfie"),
    });

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "reserved",
    });
    expect(ctx.storyCap.getReservation(book.id)?.status).toBe("reserved");
    expect(ctx.storyCap.getUsage(guardian.familyId, guardian.id).count).toBe(1);

    await ctx.workflow.drain();
    expect(ctx.storyCap.getReservation(book.id)?.status).toBe("committed");
    const usageAfterText = ctx.storyCap.getUsage(guardian.familyId, guardian.id);
    expect(usageAfterText.count).toBe(1);

    const page = ctx.store.getPagesForStorybook(book.id)[0];
    page.generationStatus = "failed";
    ctx.store.savePage(page);
    ctx.storybooks.recoverPage(guardian.id, page.id);
    await ctx.workflow.drain();
    expect(ctx.storyCap.getUsage(guardian.familyId, guardian.id).count).toBe(1);

    const failingCtx = createTestContext();
    const failingGuardian = await subscribedGuardian(failingCtx);
    const failingPersona = await failingCtx.personas.createAdult({
      memberId: failingGuardian.id,
      displayName: "Failure",
      photos: [goodPhoto(60), goodPhoto(61), goodPhoto(62)],
      selfie: Buffer.from("selfie"),
    });
    vi.spyOn(failingCtx.anthropic, "generateStory").mockRejectedValueOnce(new Error("text failed"));
    const failedBook = await failingCtx.storybooks.generate(failingGuardian.id, {
      starringPersonaIds: [failingPersona.id],
      storyType: "bedtime",
      theme: "failure",
    });
    expect(failingCtx.storyCap.getUsage(failingGuardian.familyId, failingGuardian.id).count).toBe(1);
    await expect(failingCtx.workflow.drain()).rejects.toThrow("text failed");
    expect(failingCtx.storyCap.getReservation(failedBook.id)).toBeUndefined();
    expect(failingCtx.storyCap.getUsage(failingGuardian.familyId, failingGuardian.id).count).toBe(0);
  });

  it("makes the legacy subscription migration decision explicit while keeping old tiers readable", () => {
    expect(LEGACY_TIER_COMPATIBILITY).toEqual({
      basic: "just_us",
      normal: "just_us",
      plus: "our_whole_family",
    });
    expect(legacyTierToPlan("basic")).toBe("just_us");
    expect(legacyTierToPlan("normal")).toBe("just_us");
    expect(legacyTierToPlan("plus")).toBe("our_whole_family");
  });
});
