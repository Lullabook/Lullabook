import type { DataStore } from "@/db/store";
import type { Character, Persona } from "@/domain/types";

export interface HomeRoster {
  personas: Persona[];
  characters: Character[];
  subscriptionActive: boolean;
  hasConsentReceipt: boolean;
}

export class HomeRosterService {
  constructor(private readonly store: DataStore) {}

  getForMember(memberId: string, subscriptionActiveOverride?: boolean): HomeRoster {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    const personas = this.store.getPersonasByFamily(member.familyId, memberId);
    const characters = this.store.getCharactersByFamily(member.familyId, memberId);
    const sub = this.store.getSubscription(member.familyId);
    const hasConsentReceipt = [...this.store.consentReceipts.values()].some(
      (r) => r.familyId === member.familyId
    );

    return {
      personas,
      characters,
      subscriptionActive:
        subscriptionActiveOverride ?? sub?.status === "active",
      hasConsentReceipt,
    };
  }
}
