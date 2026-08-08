/**
 * Daily Life (issue: daily moments + routine) — new domain types.
 * Fold these into `src/domain/types.ts` if you prefer a single file.
 *
 * A DayMoment is a small parent-logged note about the baby's day. Moments and
 * the routine feed the baby's persona and become story seeds.
 */

export type MomentType = "milestone" | "first" | "funny" | "tough" | "cozy";

export interface DayMoment {
  id: string;
  familyId: string;
  babyId?: string;
  createdByMemberId: string;
  type: MomentType;
  text: string;
  /** Optional photo blob key for the moment. */
  photoKey?: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface RoutineEntry {
  /** 24h "HH:MM". */
  time: string;
  icon: string;
  label: string;
}

export const MOMENT_TYPES: { key: MomentType; icon: string; label: string }[] = [
  { key: "milestone", icon: "🌟", label: "Milestone" },
  { key: "first", icon: "✨", label: "A first" },
  { key: "funny", icon: "😄", label: "Funny" },
  { key: "tough", icon: "🫂", label: "Tough day" },
  { key: "cozy", icon: "🌙", label: "Cozy" },
];

export function momentMeta(type: MomentType): { icon: string; label: string; bg: string; fg: string } {
  switch (type) {
    case "first": return { icon: "✨", label: "A first", bg: "#FBEBCE", fg: "#8C611B" };
    case "funny": return { icon: "😄", label: "Funny", bg: "#FCE4EC", fg: "#9F4A72" };
    case "tough": return { icon: "🫂", label: "Tough day", bg: "#E1F1E8", fg: "#3C7556" };
    case "cozy": return { icon: "🌙", label: "Cozy", bg: "#E4EEF4", fg: "#35707F" };
    case "milestone":
    default: return { icon: "🌟", label: "Milestone", bg: "#EDE7FE", fg: "#6A55C9" };
  }
}

export const DEFAULT_ROUTINE: RoutineEntry[] = [
  { time: "06:45", icon: "🌅", label: "Wakes up, cuddles" },
  { time: "07:30", icon: "🥣", label: "Breakfast" },
  { time: "09:30", icon: "😴", label: "Morning nap" },
  { time: "11:00", icon: "🧸", label: "Playtime & books" },
  { time: "13:00", icon: "😴", label: "Afternoon nap" },
  { time: "17:30", icon: "🍽️", label: "Dinner" },
  { time: "18:45", icon: "🛁", label: "Bath time" },
  { time: "19:30", icon: "🌙", label: "Lullaby & bed" },
];
