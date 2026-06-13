import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { DailyLifeClient } from "@/components/v2/daily-life-client";
import {
  DEFAULT_ROUTINE,
  type DayMoment,
} from "@/domain/daily-types";

export const metadata: Metadata = { title: "Daily Life" };

// TODO: replace with real data once a DayMoment store exists, e.g.
//   const moments = ctx.store.getDayMomentsByFamily(member.familyId);
//   const routine = ctx.store.getRoutine(member.familyId) ?? DEFAULT_ROUTINE;
const DEMO_MOMENTS: Pick<DayMoment, "id" | "type" | "text">[] = [
  { id: "1", type: "milestone", text: "Pulled herself up to standing at the coffee table and grinned like she'd won a medal." },
  { id: "2", type: "cozy", text: "Long bath, then fell asleep mid-lullaby with Coco the cat tucked under her arm." },
  { id: "3", type: "funny", text: "Blew raspberries at her sweet potato until the whole kitchen was laughing." },
  { id: "4", type: "first", text: "First splash in the big pool with Dada — startled, then absolutely delighted." },
];

export default async function DailyLifePage() {
  const { member } = await requireAuthedContext();
  // babyName: pull from the family's baby persona if you have it.
  const babyName = "your little one";

  const moments = DEMO_MOMENTS.map((m, i) => ({
    id: m.id,
    type: m.type,
    text: m.text,
    date: i === 0 ? "Today" : i === 1 ? "Yesterday" : `${4 - i} days ago`,
  }));

  return (
    <DailyLifeClient
      babyName={babyName}
      initialMoments={moments}
      routine={DEFAULT_ROUTINE}
      memberId={member.id}
    />
  );
}
