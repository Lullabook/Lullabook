import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import type { MomentType } from "@/domain/daily-types";
import type { Moment } from "@/domain/types";

function serializeMoment(moment: Moment) {
  return {
    ...moment,
    createdAt: moment.createdAt.toISOString(),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const body = (await request.json()) as {
      babyId: string;
      body?: string;
      text?: string;
      momentType?: MomentType;
      occurredOn?: string;
      significant?: boolean;
      isSignificant?: boolean;
      linkedPersonaIds?: string[];
      linkedCharacterIds?: string[];
      linkedPeople?: { personaId?: string; characterId?: string }[];
    };

    if (!body.babyId) {
      return jsonError("babyId is required", 400);
    }

    const momentBody = (body.body ?? body.text ?? "").trim();
    const linkedPersonaIds =
      body.linkedPersonaIds ??
      body.linkedPeople?.flatMap((p) => (p.personaId ? [p.personaId] : [])) ??
      [];
    const linkedCharacterIds =
      body.linkedCharacterIds ??
      body.linkedPeople?.flatMap((p) => (p.characterId ? [p.characterId] : [])) ??
      [];

    try {
      const moment = ctx.moments.create({
        memberId: member.id,
        babyId: body.babyId,
        body: momentBody,
        momentType: body.momentType,
        occurredOn: body.occurredOn,
        isSignificant: body.isSignificant ?? body.significant,
        linkedPersonaIds,
        linkedCharacterIds,
      });
      await ctx.persist();
      return jsonOk({ moment: serializeMoment(moment) });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const babyId = new URL(request.url).searchParams.get("babyId");
    if (!babyId) {
      return jsonError("babyId is required", 400);
    }

    try {
      const moments = ctx.moments.list(member.id, babyId);
      return jsonOk({ moments: moments.map(serializeMoment) });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
