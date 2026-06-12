import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";
import type { TraitQuestionnaire } from "@/domain/types";

function sampleQuestionnaire(overrides: Partial<TraitQuestionnaire> = {}): TraitQuestionnaire {
  return {
    name: "Emma",
    nickname: "Emmy",
    relationships: ["mama", "papa"],
    favoriteAnimals: ["bunny"],
    favoriteToys: ["teddy"],
    songs: ["Twinkle Twinkle"],
    topics: ["dinosaurs"],
    isFictional: false,
    ...overrides,
  };
}

describe("21 — Character → Persona upgrade", () => {
  it("promotes a Character to a Persona carrying traits forward", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-promote", "promote@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_p", "sub_p");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    const persona = await ctx.characters.promoteToPersona({
      characterId: character.id,
      memberId: guardian.id,
      kind: "baby",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(persona.kind).toBe("baby");
    expect(persona.displayName).toBe("Emma");
    expect(persona.promotedFromCharacterId).toBe(character.id);
    expect(persona.questionnaire).toMatchObject({
      nickname: "Emmy",
      favoriteAnimals: ["bunny"],
      topics: ["dinosaurs"],
    });
    expect(ctx.store.getCharacter(character.id, guardian.id)).toBeDefined();
  });

  it("runs the full baby gate (subscription + consent), not the light Character checkpoint", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-baby-gate", "babygate@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    const promote = () =>
      ctx.characters.promoteToPersona({
        characterId: character.id,
        memberId: guardian.id,
        kind: "baby",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      });

    await expect(promote()).rejects.toThrow(/subscription/i);

    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_bg", "sub_bg");
    await expect(promote()).rejects.toThrow(/consent receipt/i);

    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const persona = await promote();
    expect(persona.kind).toBe("baby");
    expect(ctx.store.getLightConsentReceiptForCharacter(character.id)).toBeDefined();
    expect(ctx.store.getConsentReceiptForFamily(guardian.familyId)).toBeDefined();
  });

  it("runs the full adult gate (liveness), not the light Character checkpoint", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-adult-gate", "adultgate@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Mom" }),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    ctx.liveness.shouldMatch = false;
    await expect(
      ctx.characters.promoteToPersona({
        characterId: character.id,
        memberId: guardian.id,
        kind: "adult",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
        selfie: Buffer.from("selfie"),
      })
    ).rejects.toThrow(/selfie/i);

    ctx.liveness.shouldMatch = true;
    const persona = await ctx.characters.promoteToPersona({
      characterId: character.id,
      memberId: guardian.id,
      kind: "adult",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(persona.kind).toBe("adult");
    expect(ctx.liveness.verifyCalls).toBeGreaterThan(0);
  });

  it("kicks off LoRA training and transitions Persona to ready", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-train", "train@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_tr", "sub_tr");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    const persona = await ctx.characters.promoteToPersona({
      characterId: character.id,
      memberId: guardian.id,
      kind: "baby",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(ctx.fal.trainCalls).toBe(1);
    expect(persona.status).toBe("ready");
    expect(persona.loraWeightKey).toMatch(/^lora\//);
    expect(ctx.workflow.steps).toContain("wait-for-training");
  });

  it("never acquires biometric data or LoRA for an unpromoted Character", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-unpromoted", "unpromoted@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    expect(ctx.fal.trainCalls).toBe(0);
    expect(ctx.liveness.verifyCalls).toBe(0);
    expect(ctx.blobs.size()).toBe(0);
    expect(ctx.store.personas.size).toBe(0);
  });

  it("hard-delete removes promoted Persona photos and LoRA weights", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-del-promo", "delpromo@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_dp", "sub_dp");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    const persona = await ctx.characters.promoteToPersona({
      characterId: character.id,
      memberId: guardian.id,
      kind: "baby",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(ctx.blobs.size()).toBeGreaterThan(0);
    expect(persona.loraWeightKey).toBeTruthy();

    await ctx.hardDelete.hardDelete(guardian.id);

    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.blobs.size()).toBe(0);
  });

  it("blocks re-promotion of an already-promoted Character", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-repromo", "repromo@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_rp", "sub_rp");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    await ctx.characters.promoteToPersona({
      characterId: character.id,
      memberId: guardian.id,
      kind: "baby",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    await expect(
      ctx.characters.promoteToPersona({
        characterId: character.id,
        memberId: guardian.id,
        kind: "baby",
        photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      })
    ).rejects.toThrow(/already promoted/i);
  });
});
