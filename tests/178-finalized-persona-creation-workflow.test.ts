import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";
import { runPersonaCreationFinalizedBody } from "@/workflows/persona-creation-finalized-body";

describe("178 — finalized Persona creation workflow", () => {
  it("submits a single idempotent Fal training request from committed source keys", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian", "guardian@example.com");
    const personaId = "persona-finalized";
    const photoKeys = [0, 1, 2].map((index) => `persona-creation/${guardian.familyId}/r1/photos/${index}.jpg`);
    for (const key of photoKeys) await ctx.blobs.put(key, goodPhoto());
    ctx.store.savePersona({
      id: personaId,
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Maya",
      status: "training",
      loraWeightKey: null,
      avatarKey: null,
      reviewSampleKeys: [],
      likenessConfirmed: false,
      createdAt: new Date(),
    });
    const payload = {
      type: "persona-creation-finalized" as const,
      eventId: "outbox-1",
      familyId: guardian.familyId,
      personaId,
      reservationId: "r1",
    };

    await runPersonaCreationFinalizedBody(ctx, payload, photoKeys);
    await runPersonaCreationFinalizedBody(ctx, payload, photoKeys);

    expect(ctx.fal.trainingSubmissions).toHaveLength(1);
    expect(ctx.fal.trainingSubmissions[0]).toMatchObject({
      idempotencyKey: "persona-creation-training:outbox-1",
    });
    expect([...ctx.store.falTrainingRequests.values()]).toHaveLength(1);
  });
});
