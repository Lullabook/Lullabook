import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import { createTestContext, goodPhoto } from "@/test/fixtures";

describe("RLS — Family isolation for Persona, Baby, and bond rows", () => {
  it("blocks cross-Family reads of Babies, Personas, and Baby–Person bonds", async () => {
    const ctx = createTestContext();
    const familyOne = ctx.onboarding.ensureFamilyForNewUser("rls-auth-1", "one@example.com");
    const familyTwo = ctx.onboarding.ensureFamilyForNewUser("rls-auth-2", "two@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: familyOne.id,
      displayName: "One",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    const baby = ctx.babies.addBaby({ memberId: familyOne.id, displayName: "One Baby" });
    const bond = ctx.familyRoster.updateBond({
      memberId: familyOne.id,
      babyId: baby.id,
      personaId: persona.id,
      relationship: "parent",
      babyCallsThem: "Mama",
      theyCallBaby: "sunshine",
    });

    expect(() => ctx.store.getBaby(baby.id, familyTwo.id)).toThrow(RlsViolationError);
    expect(() => ctx.store.getBabiesByFamily(familyOne.familyId, familyTwo.id)).toThrow(RlsViolationError);
    expect(() => ctx.store.getPersona(persona.id, familyTwo.id)).toThrow(RlsViolationError);
    expect(() => ctx.store.getBondsForBaby(baby.id, familyTwo.id)).toThrow(RlsViolationError);
    expect(bond.babyId).toBe(baby.id);
  });

  it("rejects writes that try to join a Baby and Persona from different Families", () => {
    const ctx = createTestContext();
    const familyOne = ctx.onboarding.ensureFamilyForNewUser("rls-write-1", "one@example.com");
    const familyTwo = ctx.onboarding.ensureFamilyForNewUser("rls-write-2", "two@example.com");
    const baby = ctx.babies.addBaby({ memberId: familyOne.id, displayName: "One Baby" });
    const foreignPersona = {
      id: "foreign-persona",
      familyId: familyTwo.familyId,
      createdByMemberId: familyTwo.id,
      kind: "adult" as const,
      displayName: "Foreign",
      status: "ready" as const,
      loraWeightKey: null,
      avatarKey: null,
      createdAt: new Date(),
    };
    ctx.store.savePersona(foreignPersona);

    expect(() => ctx.store.saveBabyPersonBond({
      id: "cross-family-bond",
      babyId: baby.id,
      personaId: foreignPersona.id,
      relationship: "invalid",
      babyCallsThem: "invalid",
      theyCallBaby: "invalid",
    })).toThrow(RlsViolationError);
  });
});
