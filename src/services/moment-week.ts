import type { Moment } from "@/domain/types";

export interface DayMoments {
  /** YYYY-MM-DD */
  date: string;
  /** Short label e.g. Mon, Tue */
  label: string;
  moments: Moment[];
}

export interface WeekMoments {
  /** Monday YYYY-MM-DD of this week */
  weekStart: string;
  days: DayMoments[];
}

/** Monday 00:00 UTC for the week containing `date`. */
export function weekStartMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Bucket a Baby's moments into a Mon–Sun week grid (issue 52). */
export function groupMomentsByWeek(
  moments: Moment[],
  weekOf: string,
  now = new Date()
): WeekMoments {
  const weekStart = weekStartMonday(new Date(`${weekOf}T12:00:00Z`));
  const days: DayMoments[] = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayMoments = moments
      .filter((m) => m.occurredOn === date)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const label =
      date === now.toISOString().slice(0, 10)
        ? "Today"
        : DAY_LABELS[i]!;
    days.push({ date, label, moments: dayMoments });
  }

  return { weekStart, days };
}

/** Previous week's Monday. */
export function previousWeekStart(weekStart: string): string {
  return addDays(weekStart, -7);
}

/** Next week's Monday (not beyond current week). */
export function nextWeekStart(weekStart: string): string {
  return addDays(weekStart, 7);
}

export function isCurrentWeek(weekStart: string, now = new Date()): boolean {
  return weekStart === weekStartMonday(now);
}
