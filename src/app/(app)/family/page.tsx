import type { Metadata } from "next";
import {
  FamilyPageClient,
  type FamilyMemberViewData,
} from "@/components/v2/family-page-client";
import { TrainingProgressRail } from "@/components/v2/training-progress-rail";
import { requireAuthedContext } from "@/lib/auth";
import { castSlotInfo } from "@/lib/cast-limits";
import { AVATAR_GRADIENTS, HEADER_GRADIENTS } from "@/lib/v2-theme";

export const metadata: Metadata = { title: "Family" };

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ training?: string }>;
}) {
  const { ctx, member } = await requireAuthedContext();
  const { training } = await searchParams;
  const baby = ctx.babies.ensureDefaultBaby(member.id);
  const roster = ctx.familyRoster.listForBaby(member.id, baby.id);
  const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);

  const members: FamilyMemberViewData[] = roster.map((entry, i) => {
    const voiceClips = ctx.store
      .getVoiceClipsForPersona(entry.persona.id, member.id)
      .map((clip) => ({
        label: clip.label,
        durationSecs: clip.durationSecs,
        transcript: clip.transcript,
      }));

    return {
      id: entry.persona.id,
      name: entry.persona.displayName,
      relationship: entry.bond?.relationship ?? "Family",
      babyCalls: entry.bond?.babyCallsThem ?? entry.persona.displayName,
      theyCallBaby: entry.bond?.theyCallBaby ?? baby.displayName,
      initial: entry.persona.displayName.charAt(0).toUpperCase(),
      avBg: AVATAR_GRADIENTS[(i + 1) % AVATAR_GRADIENTS.length]!,
      headerBg: HEADER_GRADIENTS[(i + 1) % HEADER_GRADIENTS.length]!,
      photoCount: entry.photoCount,
      personaStatus: entry.persona.status,
      avatarKey: entry.persona.avatarKey,
      kind: entry.persona.kind,
      voiceClips,
    };
  });

  return (
    <>
      <FamilyPageClient
        babyName={baby.displayName}
        members={members}
        subscribed={slots.subscribed}
        castUsed={slots.used}
        castLimit={slots.limit}
        canAddCast={slots.canAdd}
      />
      <TrainingProgressRail initiallyOpen={training === "1"} />
    </>
  );
}
