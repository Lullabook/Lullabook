import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Character, LightConsentReceipt, Persona, PersonaKind, TraitQuestionnaire } from "@/domain/types";
import { ConsentEngine } from "@/services/consent-engine";
import type { PersonaService } from "@/services/persona";

export interface CreateCharacterInput {
  memberId: string;
  questionnaire: TraitQuestionnaire;
  attestation?: string;
}

export interface PromoteCharacterInput {
  characterId: string;
  memberId: string;
  kind: PersonaKind;
  photos: Buffer[];
  selfie?: Buffer;
}

export class CharacterService {
  constructor(
    private readonly store: DataStore,
    private readonly personas: PersonaService,
    private readonly consentEngine: ConsentEngine = new ConsentEngine()
  ) {}

  async create(input: CreateCharacterInput): Promise<Character> {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");

    if (!input.questionnaire.isFictional) {
      const gate = this.consentEngine.check({
        jurisdiction: member.jurisdiction,
        actorRole: member.role,
        action: "create_character",
        hasActiveSubscription: this.store.getSubscription(member.familyId)?.status === "active",
        hasConsentReceipt: !!this.store.getConsentReceiptForFamily(member.familyId),
        hasAttestation: !!input.attestation,
      });
      if (!gate.allowed) {
        throw new Error(gate.reason ?? "Character creation blocked");
      }
    }

    const character: Character = {
      id: uuid(),
      familyId: member.familyId,
      createdByMemberId: member.id,
      displayName: input.questionnaire.name,
      questionnaire: input.questionnaire,
      createdAt: new Date(),
    };
    this.store.saveCharacter(character);

    if (!input.questionnaire.isFictional && input.attestation) {
      const config = ConsentEngine.getJurisdiction(member.jurisdiction);
      if (!config) throw new Error("Unknown jurisdiction");
      if (config.characterConsentMethod === "light_attestation") {
        const receipt: LightConsentReceipt = {
          id: uuid(),
          characterId: character.id,
          familyId: member.familyId,
          memberId: member.id,
          jurisdiction: member.jurisdiction,
          noticeVersion: config.noticeVersion,
          attestation: input.attestation,
          consentedAt: new Date(),
        };
        this.store.saveLightConsentReceipt(receipt);
      }
    }

    return character;
  }

  async promoteToPersona(input: PromoteCharacterInput): Promise<Persona> {
    const character = this.store.getCharacter(input.characterId, input.memberId);
    if (!character) throw new Error("Character not found");
    if (character.promotedPersonaId) throw new Error("Character already promoted");

    const createInput = {
      memberId: input.memberId,
      displayName: character.displayName,
      photos: input.photos,
      selfie: input.selfie,
      promotedFromCharacterId: character.id,
      questionnaire: character.questionnaire,
    };

    const persona =
      input.kind === "baby"
        ? await this.personas.createBaby(createInput)
        : await this.personas.createAdult(createInput);

    character.promotedPersonaId = persona.id;
    this.store.saveCharacter(character);

    return persona;
  }
}
