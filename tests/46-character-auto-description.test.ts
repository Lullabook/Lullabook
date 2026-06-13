import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import { createTestContext } from "@/test/fixtures";
import type { TraitQuestionnaire } from "@/domain/types";

function fictionalQuestionnaire(overrides: Partial<TraitQuestionnaire> = {}): TraitQuestionnaire {
  return {
    name: "Coco the Cat",
    nickname: "Coco",
    favoriteAnimals: ["cats"],
    favoriteToys: ["yarn"],
    topics: ["Curious", "Cuddly"],
    isFictional: true,
    ...overrides,
  };
}

describe("46 — Character auto-description (issue 46)", () => {
  it("generates a description via the Anthropic seam exactly once on create", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-46a", "a46@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(ctx.anthropic.characterDescriptionCalls).toHaveLength(1);
    expect(ctx.anthropic.characterDescriptionCalls[0]!.name).toBe("Coco the Cat");
    expect(character.description.length).toBeGreaterThan(0);
  });

  it("persists the generated description on the Character", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-46b", "b46@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    const stored = ctx.store.getCharacter(character.id, guardian.id);
    expect(stored?.description).toBe(character.description);
    expect(stored?.description).toContain("Coco the Cat");
  });

  it("does not generate a description for rejected real-child Characters", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-46c", "c46@example.com");

    await expect(
      ctx.characters.create({
        memberId: guardian.id,
        questionnaire: fictionalQuestionnaire({ name: "Emma", isFictional: false }),
      })
    ).rejects.toThrow(/fictional|Family roster/i);

    expect(ctx.anthropic.characterDescriptionCalls).toHaveLength(0);
  });

  it("enforces RLS — another family cannot read the description", async () => {
    const ctx = createTestContext();
    const gA = ctx.onboarding.ensureFamilyForNewUser("auth-46d", "d46@example.com");
    const gB = ctx.onboarding.ensureFamilyForNewUser("auth-46e", "e46@example.com");

    const character = await ctx.characters.create({
      memberId: gA.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(() => ctx.store.getCharacter(character.id, gB.id)).toThrow(RlsViolationError);
  });
});
