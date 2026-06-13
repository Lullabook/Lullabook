import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import { createTestContext } from "@/test/fixtures";
import type { TraitQuestionnaire } from "@/domain/types";

function fictionalQuestionnaire(overrides: Partial<TraitQuestionnaire> = {}): TraitQuestionnaire {
  return {
    name: "Pip the Dragon",
    nickname: "Pip",
    favoriteAnimals: ["dragons"],
    favoriteToys: ["bubbles"],
    topics: ["adventure"],
    isFictional: true,
    ...overrides,
  };
}

describe("19 — Character trait questionnaire (fictional-only, issue 36)", () => {
  it("creates a fictional Character with no photo, LoRA, or Persona", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-char", "char@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(character.displayName).toBe("Pip the Dragon");
    expect(character.familyId).toBe(guardian.familyId);
    expect(ctx.store.personas.size).toBe(0);
    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("rejects real-child Characters — real people belong in Family roster", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-real", "real@example.com");

    await expect(
      ctx.characters.create({
        memberId: guardian.id,
        questionnaire: fictionalQuestionnaire({ name: "Emma", isFictional: false }),
        attestation: "I attest",
      })
    ).rejects.toThrow(/fictional|Family roster/i);
  });

  it("does not invoke the heavy biometric gate for Character creation", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-no-bio", "nobio@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(ctx.liveness.verifyCalls).toBe(0);
    expect(ctx.blobs.size()).toBe(0);
  });

  it("enforces RLS — Member of Family A cannot read Family B characters", async () => {
    const ctx = createTestContext();
    const gA = ctx.onboarding.ensureFamilyForNewUser("auth-a", "a@example.com");
    const gB = ctx.onboarding.ensureFamilyForNewUser("auth-b", "b@example.com");

    const character = await ctx.characters.create({
      memberId: gA.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(() => ctx.store.getCharacter(character.id, gB.id)).toThrow(RlsViolationError);
  });
});
