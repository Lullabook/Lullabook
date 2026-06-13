import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/fixtures";
import type { TraitQuestionnaire } from "@/domain/types";

function fictionalQuestionnaire(overrides: Partial<TraitQuestionnaire> = {}): TraitQuestionnaire {
  return {
    name: "Pip the Dragon",
    favoriteAnimals: ["dragons"],
    topics: ["bubbles"],
    isFictional: true,
    ...overrides,
  };
}

describe("21 — Character → Persona upgrade (retired, issue 36)", () => {
  it("retires promote — directs users to Family roster", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-promote", "promote@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    await expect(
      ctx.characters.promoteToPersona({
        characterId: character.id,
        memberId: guardian.id,
        kind: "baby",
        photos: [],
      })
    ).rejects.toThrow(/fictional-only|Family roster|retired/i);
  });

  it("creates fictional characters without biometric pipeline", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-unpromoted", "unpromoted@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(ctx.fal.trainCalls).toBe(0);
    expect(ctx.liveness.verifyCalls).toBe(0);
    expect(ctx.blobs.size()).toBe(0);
    expect(ctx.store.personas.size).toBe(0);
  });

  it("hard-delete removes fictional characters", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-del-char", "delchar@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
  });
});
