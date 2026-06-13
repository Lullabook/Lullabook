import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { DailyLifeClient } from "@/components/v2/daily-life-client";
import { DEFAULT_ROUTINE } from "@/domain/daily-types";
import { formatMomentDateLabel } from "@/services/moment";

export const metadata: Metadata = { title: "Daily Life" };

export default async function DailyLifePage() {
  const { ctx, member } = await requireAuthedContext();
  const baby = ctx.babies.getSelected(member.id) ?? ctx.babies.ensureDefaultBaby(member.id);
  const rows = ctx.moments.list(member.id, baby.id);

  const moments = rows.map((m) => ({
    id: m.id,
    type: m.momentType,
    text: m.body,
    date: formatMomentDateLabel(m.occurredOn),
    isSignificant: m.isSignificant,
  }));

  return (
    <DailyLifeClient
      babyId={baby.id}
      babyName={baby.displayName}
      initialMoments={moments}
      routine={DEFAULT_ROUTINE}
      memberId={member.id}
    />
  );
}
