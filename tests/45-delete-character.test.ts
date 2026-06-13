import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import { createTestContext, householdWithBaby } from "@/test/fixtures";

describe("45 — delete Character (hard-delete, ADR-0007)", () => {
  it("hard-deletes a fictional Character from the family roster", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Pip the Dragon", isFictional: true },
    });
    expect(
      ctx.store.getCharactersByFamily(guardian.familyId, guardian.id)
    ).toHaveLength(1);

    await ctx.characters.delete({
      characterId: character.id,
      memberId: guardian.id,
    });

    expect(
      ctx.store.getCharactersByFamily(guardian.familyId, guardian.id)
    ).toHaveLength(0);
    expect(ctx.store.getCharacter(character.id, guardian.id)).toBeUndefined();
  });

  it("also purges any light consent receipt tied to the Character", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Coco", isFictional: true },
    });
    ctx.store.saveLightConsentReceipt({
      id: "lcr-1",
      characterId: character.id,
      familyId: guardian.familyId,
      memberId: guardian.id,
      jurisdiction: "US",
      noticeVersion: "v1",
      attestation: "I attest",
      consentedAt: new Date(),
    });
    expect(
      ctx.store.getLightConsentReceiptForCharacter(character.id)
    ).toBeDefined();

    await ctx.characters.delete({
      characterId: character.id,
      memberId: guardian.id,
    });

    expect(
      ctx.store.getLightConsentReceiptForCharacter(character.id)
    ).toBeUndefined();
  });

  it("enforces RLS — a Member cannot delete another family's Character", async () => {
    const ctx = createTestContext();
    const gA = ctx.onboarding.ensureFamilyForNewUser("auth-a", "a@example.com");
    const gB = ctx.onboarding.ensureFamilyForNewUser("auth-b", "b@example.com");
    const character = await ctx.characters.create({
      memberId: gA.id,
      questionnaire: { name: "Pip", isFictional: true },
    });

    await expect(
      ctx.characters.delete({ characterId: character.id, memberId: gB.id })
    ).rejects.toThrow(RlsViolationError);

    expect(ctx.store.getCharacter(character.id, gA.id)).toBeDefined();
  });

  it("throws a clear error when the Character does not exist", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);

    await expect(
      ctx.characters.delete({ characterId: "missing", memberId: guardian.id })
    ).rejects.toThrow(/not found/i);
  });
});
