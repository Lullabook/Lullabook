import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { DailyLifeClient } from "@/components/v2/daily-life-client";
import { DEFAULT_ROUTINE } from "@/domain/daily-types";
import { formatMomentDateLabel } from "@/services/moment";
import { groupMomentsByWeek, weekStartMonday } from "@/services/moment-week";

export const metadata: Metadata = { title: "Daily Life" };

export default async function DailyLifePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; week?: string }>;
}) {
  const { ctx, member } = await requireAuthedContext();
  const params = await searchParams;
  const baby = ctx.babies.getSelected(member.id) ?? ctx.babies.ensureDefaultBaby(member.id);
  const views = ctx.moments.listViews(member.id, baby.id);
  const roster = ctx.familyRoster.listForBaby(member.id, baby.id);

  const today = new Date().toISOString().slice(0, 10);
  const prefillDate = params.date === "today" || !params.date ? today : params.date;
  const weekOf = params.week ?? weekStartMonday(new Date());
  const allMoments = views.map((v) => v.moment);
  const week = groupMomentsByWeek(allMoments, weekOf);

  const moments = views.map((v) => ({
    id: v.moment.id,
    type: v.moment.momentType,
    text: v.moment.body,
    date: formatMomentDateLabel(v.moment.occurredOn),
    isSignificant: v.moment.isSignificant,
    linkedPeople: v.linkedPeople,
  }));

  // "Who was there?" lists only real family members — made-up Characters are
  // never present at a real moment in the baby's day.
  const castOptions = roster.map((m) => ({
    id: m.persona.id,
    name: m.bond?.babyCallsThem ?? m.persona.displayName,
    kind: "adult" as const,
  }));

  const weekDays = week.days.map((d) => ({
    date: d.date,
    label: d.label,
    moments: d.moments.map((m) => ({
      id: m.id,
      text: m.body,
      isSignificant: m.isSignificant,
      type: m.momentType,
    })),
  }));

  return (
    <DailyLifeClient
      babyId={baby.id}
      babyName={baby.displayName}
      initialMoments={moments}
      routine={baby.dailyRoutine ?? DEFAULT_ROUTINE}
      canEditRoutine={member.role === "guardian"}
      castOptions={castOptions}
      prefillDate={prefillDate}
      initialView={params.week ? "week" : "timeline"}
      weekStart={week.weekStart}
      weekDays={weekDays}
    />
  );
}
