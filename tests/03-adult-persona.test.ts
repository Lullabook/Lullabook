import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("03 — adult persona creation", () => {
  it("rejects selfie mismatch", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-adult", "adult@example.com");
    ctx.liveness.shouldMatch = false;

    await expect(
      ctx.personas.createAdult({
        memberId: member.id,
        displayName: "Mom",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/selfie/i);
  });

  it("rejects unusable photos before trainer is called", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-preflight", "pf@example.com");

    const badPhoto = goodPhoto(0x00);

    await expect(
      ctx.personas.createAdult({
        memberId: member.id,
        displayName: "Dad",
        photos: [badPhoto, goodPhoto(), goodPhoto()],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/pre-flight/i);

    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("transitions persona to ready after training webhook", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-train", "train@example.com");

    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Aunt",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(persona.status).toBe("ready");
    expect(ctx.workflow.steps).toContain("wait-for-training");
  });

  it("shows likeness confirmation samples on ready", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-like", "like@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Uncle",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    const samples = ctx.personas.getLikenessSamples(persona.id, member.id);
    expect(samples.length).toBeGreaterThan(0);
    expect(ctx.personas.acceptLikeness(persona.id, member.id).status).toBe("ready");
  });
  it("flips persona to failed and emails member when persona-create fails", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-fail", "fail@example.com");

    const { personaCreate } = await import("@/workflows/functions");
    const contextModule = await import("@/lib/context");
    const vi = await import("vitest");
    (ctx.store as any).hydrateByMemberId = async () => {};
    (ctx.store as any).sync = async () => {};
    (ctx as any).persist = async () => {};
    ctx.personas.createAdult = async () => {
      ctx.store.savePersona({
        id: "p1",
        familyId: member.familyId,
        createdByMemberId: member.id,
        kind: "adult",
        displayName: "Failing",
        status: "training",
        loraWeightKey: null,
        avatarKey: null,
        createdAt: new Date(),
      });
      throw new Error("Validation failure");
    };
    (ctx.workflow as any).runWithStepContext = async (_: unknown, fn: () => Promise<void>) => fn();
    const spy = vi.vi.spyOn(contextModule, "createRequestContext").mockReturnValue(ctx as any);

    try {
      await expect(personaCreate.fn({
        event: {
          data: {
            mode: "adult",
            memberId: member.id,
            displayName: "Failing",
            photoKeys: [],
          },
        },
        step: {}
      } as any)).rejects.toThrow("Validation failure");
    } finally {
      spy.mockRestore();
    }

    const persona = [...ctx.store.personas.values()].find(p => p.displayName === "Failing");
    expect(persona?.status).toBe("failed");
    expect(ctx.notifications.emails.length).toBeGreaterThan(0);
  }, 15000);

  it("enforces RLS on likeness samples", async () => {
    const ctx = createTestContext();
    const member1 = ctx.onboarding.ensureFamilyForNewUser("auth-fam1", "fam1@example.com");
    const member2 = ctx.onboarding.ensureFamilyForNewUser("auth-fam2", "fam2@example.com");

    const persona = await ctx.personas.createAdult({
      memberId: member1.id,
      displayName: "Dad",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(() => ctx.personas.getLikenessSamples(persona.id, member2.id)).toThrow(/another family/i);
  });
});
