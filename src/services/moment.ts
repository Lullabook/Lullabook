import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Moment, MomentPersonLink } from "@/domain/types";
import type { MomentType } from "@/domain/daily-types";

export interface CreateMomentInput {
  memberId: string;
  babyId: string;
  body: string;
  occurredOn?: string;
  isSignificant?: boolean;
  momentType?: MomentType;
  linkedPersonaIds?: string[];
  linkedCharacterIds?: string[];
}

export interface LinkedPersonView {
  personaId?: string;
  characterId?: string;
  name: string;
  initial: string;
  kind: "adult" | "character";
}

export interface MomentView {
  moment: Moment;
  linkedPeople: LinkedPersonView[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function significanceForType(type: MomentType): boolean {
  return type === "milestone" || type === "first";
}

export class MomentService {
  constructor(private readonly store: DataStore) {}

  create(input: CreateMomentInput): Moment {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");
    const baby = this.store.getBaby(input.babyId, input.memberId);
    if (!baby) throw new Error("Baby not found");

    const momentType = input.momentType ?? "milestone";
    const moment: Moment = {
      id: uuid(),
      familyId: member.familyId,
      babyId: baby.id,
      createdByMemberId: member.id,
      body: input.body.trim(),
      occurredOn: input.occurredOn ?? todayIso(),
      isSignificant: input.isSignificant ?? significanceForType(momentType),
      momentType,
      createdAt: new Date(),
    };
    if (!moment.body) throw new Error("Moment text is required");
    this.store.saveMoment(moment);
    this.persistLinkedPeople(input.memberId, moment.id, input);
    return moment;
  }

  list(memberId: string, babyId: string): Moment[] {
    return this.store.getMomentsForBaby(babyId, memberId);
  }

  listViews(memberId: string, babyId: string): MomentView[] {
    return this.list(memberId, babyId).map((moment) => ({
      moment,
      linkedPeople: this.linkedPeopleForMoment(memberId, moment.id),
    }));
  }

  hasMomentOnDate(memberId: string, babyId: string, dateIso: string): boolean {
    return this.list(memberId, babyId).some((m) => m.occurredOn === dateIso);
  }

  linkedPeopleForMoment(memberId: string, momentId: string): LinkedPersonView[] {
    const moment = this.store.moments.get(momentId);
    if (!moment) return [];
    const baby = this.store.getBaby(moment.babyId, memberId);
    if (!baby) return [];

    return this.store.getMomentPeople(momentId).map((link) => {
      if (link.personaId) {
        const persona = this.store.getPersona(link.personaId, memberId);
        const name = persona?.displayName ?? "Family";
        return {
          personaId: link.personaId,
          name,
          initial: name.charAt(0).toUpperCase(),
          kind: "adult" as const,
        };
      }
      const character = this.store.getCharacter(link.characterId!, memberId);
      const name = character?.displayName ?? "Character";
      return {
        characterId: link.characterId,
        name,
        initial: name.charAt(0).toUpperCase(),
        kind: "character" as const,
      };
    });
  }

  private persistLinkedPeople(
    memberId: string,
    momentId: string,
    input: CreateMomentInput
  ): void {
    const personaIds = new Set(input.linkedPersonaIds ?? []);
    const characterIds = new Set(input.linkedCharacterIds ?? []);

    for (const personaId of personaIds) {
      if (!this.store.getPersona(personaId, memberId)) {
        throw new Error(`Persona ${personaId} not found`);
      }
      const link: MomentPersonLink = { id: uuid(), momentId, personaId };
      this.store.saveMomentPersonLink(link);
    }
    for (const characterId of characterIds) {
      if (!this.store.getCharacter(characterId, memberId)) {
        throw new Error(`Character ${characterId} not found`);
      }
      const link: MomentPersonLink = { id: uuid(), momentId, characterId };
      this.store.saveMomentPersonLink(link);
    }
  }
}

/** Format occurred_on for the Daily timeline display. */
export function formatMomentDateLabel(occurredOn: string, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  if (occurredOn === today) return "Today";
  if (occurredOn === yesterdayIso) return "Yesterday";

  const then = new Date(`${occurredOn}T12:00:00Z`);
  const diffDays = Math.round(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())) /
      86_400_000
  );
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
