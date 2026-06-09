import type { DataStore } from "@/db/store";
import type { Persona } from "@/domain/types";

export class PersonaRosterService {
  constructor(private readonly store: DataStore) {}

  listForCurrentFamily(actorMemberId: string): Persona[] {
    const actor = this.store.members.get(actorMemberId);
    if (!actor) throw new Error("Member not found");
    return this.store.getPersonasByFamily(actor.familyId, actorMemberId);
  }
}
