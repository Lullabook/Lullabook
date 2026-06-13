import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import type { TraitQuestionnaire, TextStoryBrief } from "@/domain/types";

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const body = (await request.json()) as {
      questionnaire: TraitQuestionnaire;
      attestation?: string;
    };
    try {
      const character = await ctx.characters.create({
        memberId: member.id,
        questionnaire: body.questionnaire,
        attestation: body.attestation,
      });
      await ctx.persist();
      return jsonOk({ characterId: character.id });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
