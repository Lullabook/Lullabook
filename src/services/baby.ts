import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Baby, RosterScope } from "@/domain/types";

export interface AddBabyInput {
  memberId: string;
  displayName: string;
  birthDate?: string | null;
  rosterScope?: RosterScope;
}

export interface UpdateBabyInput {
  memberId: string;
  babyId: string;
  displayName?: string;
  birthDate?: string | null;
  dailyRoutine?: import("@/domain/daily-types").RoutineEntry[] | null;
}

function normalizeBirthDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Birthday must be YYYY-MM-DD");
  }
  return value;
}

export class BabyService {
  constructor(private readonly store: DataStore) {}

  list(memberId: string): Baby[] {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    return this.store.getBabiesByFamily(member.familyId, memberId);
  }

  getSelected(memberId: string): Baby | null {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    const babies = this.list(memberId);
    if (babies.length === 0) return null;
    if (member.selectedBabyId) {
      const selected = this.store.getBaby(member.selectedBabyId, memberId);
      if (selected) return selected;
    }
    return babies.find((b) => b.isDefault) ?? babies[0];
  }

  selectBaby(memberId: string, babyId: string): Baby {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");
    member.selectedBabyId = babyId;
    return baby;
  }

  addBaby(input: AddBabyInput): Baby {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");
    if (member.role !== "guardian") {
      throw new Error("Only guardians may add babies");
    }

    const existing = this.list(input.memberId);
    const rosterScope = input.rosterScope ?? "shared";
    const rosterGroupId =
      rosterScope === "shared" && existing.length > 0
        ? existing[0].rosterGroupId
        : uuid();

    const baby: Baby = {
      id: uuid(),
      familyId: member.familyId,
      displayName: input.displayName,
      birthDate: normalizeBirthDate(input.birthDate),
      dailyRoutine: null,
      rosterGroupId,
      rosterScope,
      isDefault: existing.length === 0,
      createdAt: new Date(),
    };
    this.store.saveBaby(baby);

    if (existing.length === 0) {
      member.selectedBabyId = baby.id;
    }

    return baby;
  }

  updateBaby(input: UpdateBabyInput): Baby {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");
    if (member.role !== "guardian") {
      throw new Error("Only guardians may edit babies");
    }
    const baby = this.store.getBaby(input.babyId, input.memberId);
    if (!baby) throw new Error("Baby not found");

    const updated: Baby = {
      ...baby,
      displayName: input.displayName?.trim() || baby.displayName,
      birthDate:
        input.birthDate !== undefined
          ? normalizeBirthDate(input.birthDate)
          : baby.birthDate,
      dailyRoutine:
        input.dailyRoutine !== undefined ? input.dailyRoutine : baby.dailyRoutine,
    };
    this.store.saveBaby(updated);
    return updated;
  }

  /** Ensures at least one default Baby exists for the household. */
  ensureDefaultBaby(memberId: string, displayName = "Baby"): Baby {
    const existing = this.list(memberId);
    if (existing.length > 0) return existing.find((b) => b.isDefault) ?? existing[0];
    return this.addBaby({ memberId, displayName });
  }
}
