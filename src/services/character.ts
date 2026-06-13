import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Character, Persona, PersonaKind, TraitQuestionnaire } from "@/domain/types";

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

export interface DeleteCharacterInput {
  characterId: string;
  memberId: string;
}

export class CharacterService {
  constructor(private readonly store: DataStore) {}

  async create(input: CreateCharacterInput): Promise<Character> {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");

    if (!input.questionnaire.isFictional) {
      throw new Error(
        "Characters must be fictional. Add real people via the Family roster."
      );
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
    return character;
  }

  async promoteToPersona(_input: PromoteCharacterInput): Promise<Persona> {
    throw new Error(
      "Characters are fictional-only. Add real people to the Family roster instead."
    );
  }

  /**
   * Hard-delete a Character (ADR-0007). Characters are fictional-only with no
   * photos or trained LoRA, so deletion is a pure DB purge — the row plus any
   * light consent receipt tied to it. RLS is enforced by `getCharacter`.
   */
  async delete(input: DeleteCharacterInput): Promise<void> {
    const character = this.store.getCharacter(input.characterId, input.memberId);
    if (!character) throw new Error("Character not found");
    this.store.deleteLightConsentReceiptsForCharacter(character.id);
    this.store.deleteCharacter(character.id);
  }
}
