import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Moment } from "@/domain/types";
import type { MomentType } from "@/domain/daily-types";

export interface CreateMomentInput {
  memberId: string;
  babyId: string;
  body: string;
  occurredOn?: string;
  isSignificant?: boolean;
  momentType?: MomentType;
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
    return moment;
  }

  list(memberId: string, babyId: string): Moment[] {
    return this.store.getMomentsForBaby(babyId, memberId);
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
