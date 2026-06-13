import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { BabyPersonBond, Persona } from "@/domain/types";

export interface FamilyMemberView {
  persona: Persona;
  bond: BabyPersonBond | null;
  photoCount: number;
  voiceClipCount: number;
}

export interface UpdateBondInput {
  memberId: string;
  babyId: string;
  personaId: string;
  relationship: string;
  babyCallsThem: string;
  theyCallBaby: string;
}

export class FamilyRosterService {
  constructor(private readonly store: DataStore) {}

  listForBaby(memberId: string, babyId: string): FamilyMemberView[] {
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");

    const allAdults = this.store
      .getPersonasByFamily(baby.familyId, memberId)
      .filter((p) => p.kind === "adult");

    const personas =
      baby.rosterScope === "isolated"
        ? allAdults.filter((p) =>
            this.store
              .getBondsForBaby(babyId, memberId)
              .some((b) => b.personaId === p.id)
          )
        : allAdults;

    const bonds = this.store.getBondsForBaby(babyId, memberId);
    const bondByPersona = new Map(bonds.map((b) => [b.personaId, b]));

    return personas.map((persona) => ({
      persona,
      bond: bondByPersona.get(persona.id) ?? null,
      photoCount: persona.status === "ready" ? 3 : 0,
      voiceClipCount: this.store.getVoiceClipsForPersona(persona.id, memberId).length,
    }));
  }

  updateBond(input: UpdateBondInput): BabyPersonBond {
    const baby = this.store.getBaby(input.babyId, input.memberId);
    if (!baby) throw new Error("Baby not found");
    const persona = this.store.getPersona(input.personaId, input.memberId);
    if (!persona || persona.kind !== "adult") {
      throw new Error("Family member not found");
    }

    const existing = this.store
      .getBondsForBaby(input.babyId, input.memberId)
      .find((b) => b.personaId === input.personaId);

    const bond: BabyPersonBond = existing
      ? {
          ...existing,
          relationship: input.relationship,
          babyCallsThem: input.babyCallsThem,
          theyCallBaby: input.theyCallBaby,
        }
      : {
          id: uuid(),
          babyId: input.babyId,
          personaId: input.personaId,
          relationship: input.relationship,
          babyCallsThem: input.babyCallsThem,
          theyCallBaby: input.theyCallBaby,
        };

    this.store.saveBabyPersonBond(bond);
    return bond;
  }

  /** Personas visible for a baby's roster group (shared vs isolated). */
  listRosterPersonas(memberId: string, babyId: string): Persona[] {
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");
    const allAdults = this.store
      .getPersonasByFamily(baby.familyId, memberId)
      .filter((p) => p.kind === "adult");

    if (baby.rosterScope === "shared") {
      const sharedGroupIds = new Set(
        this.store
          .getBabiesByFamily(baby.familyId, memberId)
          .filter((b) => b.rosterScope === "shared")
          .map((b) => b.rosterGroupId)
      );
      if (sharedGroupIds.has(baby.rosterGroupId)) return allAdults;
    }
    return allAdults;
  }
}
