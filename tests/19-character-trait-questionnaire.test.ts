import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import { ConsentEngine } from "@/services/consent-engine";
import { createTestContext } from "@/test/fixtures";
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

describe("19 — Character trait questionnaire + light consent", () => {
  it("creates a Character from a Trait Questionnaire with no photo, LoRA, or Persona", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-char", "char@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    expect(character.displayName).toBe("Emma");
    expect(character.familyId).toBe(guardian.familyId);
    expect(ctx.store.personas.size).toBe(0);
    expect(ctx.fal.trainCalls).toBe(0);
  });

  it("records a light Consent receipt for a real-child Character", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-receipt", "receipt@example.com");
    const attestation = "I am a parent/guardian creating this for my own family";

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation,
    });

    const receipt = ctx.store.getLightConsentReceiptForCharacter(character.id);
    expect(receipt).toBeDefined();
    expect(receipt!.noticeVersion).toBe("us-coppa-v1");
    expect(receipt!.attestation).toBe(attestation);
    expect(receipt!.memberId).toBe(guardian.id);
    expect(receipt!.consentedAt).toBeInstanceOf(Date);
  });

  it("records no Consent receipt for a fully fictional Character", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-fiction", "fiction@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Dragon", isFictional: true }),
    });

    expect(ctx.store.getLightConsentReceiptForCharacter(character.id)).toBeUndefined();
    expect(ctx.store.lightConsentReceipts.size).toBe(0);
  });

  it("escalates Character checkpoint when jurisdiction requires the full path", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser(
      "auth-strict",
      "strict@example.com",
      "STRICT"
    );
    const input = {
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    };

    await expect(ctx.characters.create(input)).rejects.toThrow(/subscription/i);

    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_strict", "sub_strict");
    await expect(ctx.characters.create(input)).rejects.toThrow(/consent receipt/i);

    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "STRICT");
    const character = await ctx.characters.create(input);
    expect(character.displayName).toBe("Emma");
    expect(ctx.store.getLightConsentReceiptForCharacter(character.id)).toBeUndefined();
  });

  it("does not invoke the heavy biometric gate for Character creation", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-bio", "bio@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    expect(ctx.fal.trainCalls).toBe(0);
    expect(ctx.liveness.verifyCalls).toBe(0);
    expect(ctx.moderation.audit.filter((a) => a.csamDetected).length).toBe(0);
  });

  it("ConsentEngine.create_character is table-driven across consent methods", () => {
    const engine = new ConsentEngine();

    expect(
      engine.check({
        jurisdiction: "US",
        actorRole: "guardian",
        action: "create_character",
        hasActiveSubscription: false,
        hasConsentReceipt: false,
        hasAttestation: true,
      })
    ).toMatchObject({ allowed: true, requiredMethod: "light_attestation" });

    expect(
      engine.check({
        jurisdiction: "STRICT",
        actorRole: "guardian",
        action: "create_character",
        hasActiveSubscription: true,
        hasConsentReceipt: false,
        hasAttestation: true,
      }).allowed
    ).toBe(false);

    expect(
      engine.check({
        jurisdiction: "STRICT",
        actorRole: "guardian",
        action: "create_character",
        hasActiveSubscription: true,
        hasConsentReceipt: true,
        hasAttestation: true,
      })
    ).toMatchObject({ allowed: true, requiredMethod: "payment_vpc" });
  });

  it("enforces RLS — Member of Family A cannot read Family B characters", async () => {
    const ctx = createTestContext();
    const memberA = ctx.onboarding.ensureFamilyForNewUser("auth-char-a", "a@example.com");
    const memberB = ctx.onboarding.ensureFamilyForNewUser("auth-char-b", "b@example.com");

    const character = await ctx.characters.create({
      memberId: memberB.id,
      questionnaire: sampleQuestionnaire({ name: "Luna" }),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    expect(() => ctx.store.getCharacter(character.id, memberA.id)).toThrow(RlsViolationError);
    expect(() => ctx.store.getCharactersByFamily(memberB.familyId, memberA.id)).toThrow(
      RlsViolationError
    );
  });
});
