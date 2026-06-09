import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("13 — cold-start UX", () => {
  it("allows Brief building while training and auto-starts generation on ready", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-cold", "cold@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_c", "sub_c");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const brief = { starringPersonaIds: [] as string[], theme: "first book" };
    const trainingPersona = {
      id: "persona-training",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby" as const,
      displayName: "Nova",
      status: "training" as const,
      loraWeightKey: null,
      createdAt: new Date(),
    };
    ctx.store.savePersona(trainingPersona);
    brief.starringPersonaIds = [trainingPersona.id];

    ctx.coldStart.submitBriefWhileTraining(guardian.id, trainingPersona.id, brief);
    expect(ctx.coldStart.trainingExpectationCopy()).toMatch(/5 minutes/i);

    trainingPersona.status = "ready";
    trainingPersona.loraWeightKey = "lora/nova";
    ctx.store.savePersona(trainingPersona);

    await ctx.coldStart.onPersonaReady(trainingPersona.id);

    const books = ctx.store.listStorybooksForFamily(guardian.familyId, guardian.id);
    expect(books).toHaveLength(1);
    expect(books[0].status).toBe("draft");
  });

  it("notifies on persona ready", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-notify", "notify@example.com");
    await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Notify",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(ctx.notifications.emails.some((e) => e.subject.includes("ready"))).toBe(true);
    expect(ctx.notifications.pushes.some((p) => p.title.includes("ready"))).toBe(true);
  });
});
