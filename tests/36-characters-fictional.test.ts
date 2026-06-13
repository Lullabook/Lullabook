import { describe, expect, it } from "vitest";
import { createTestContext, householdWithBaby } from "@/test/fixtures";

describe("36 — characters fictional-only", () => {
  it("creates fictional characters without consent gate", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: {
        name: "Pip the Dragon",
        isFictional: true,
        favoriteAnimals: ["dragons"],
      },
    });

    expect(character.questionnaire.isFictional).toBe(true);
    expect(ctx.store.getCharactersByFamily(guardian.familyId, guardian.id)).toHaveLength(1);
  });

  it("rejects real-child characters", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);

    await expect(
      ctx.characters.create({
        memberId: guardian.id,
        questionnaire: { name: "Real Kid", isFictional: false },
        attestation: "I attest",
      })
    ).rejects.toThrow(/fictional|Family roster/i);
  });

  it("retires the promote path", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Coco", isFictional: true },
    });

    await expect(
      ctx.characters.promoteToPersona({
        characterId: character.id,
        memberId: guardian.id,
        kind: "adult",
        photos: [],
      })
    ).rejects.toThrow(/retired|fictional-only|Family roster/i);
  });
});
