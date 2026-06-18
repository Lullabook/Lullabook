import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import type { Character, TraitQuestionnaire } from "@/domain/types";

function serializeCharacter(character: Character) {
  return {
    ...character,
    createdAt: character.createdAt.toISOString(),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const character = ctx.store.getCharacter(id, member.id);
    if (!character) return jsonError("Not found", 404);
    return jsonOk({ character: serializeCharacter(character) });
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const body = (await request.json()) as { questionnaire: TraitQuestionnaire };
    try {
      const character = await ctx.characters.update({
        characterId: id,
        memberId: member.id,
        questionnaire: body.questionnaire,
      });
      await ctx.persist();
      return jsonOk({ characterId: character.id });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
