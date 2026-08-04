import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { personaStoryReadiness } from "@/services/persona";

/**
 * Bearer-authenticated read of one Persona's persisted training lifecycle
 * (ticket 188). Returns the durable status, likeness confirmation, the
 * Story-ready mapping, and the redacted failure reason — the production API
 * surface that reflects the state after a restart.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const persona = ctx.store.getPersona(id, member.id);
    if (!persona) return jsonError("Persona not found", 404);
    const readiness = personaStoryReadiness(persona);
    return jsonOk({
      personaId: persona.id,
      kind: persona.kind,
      status: persona.status,
      likenessConfirmed: persona.likenessConfirmed === true,
      storyReady: readiness.storyReady,
      readinessReason: readiness.reason,
      reviewSampleCount: persona.reviewSampleKeys?.length ?? 0,
      ...(persona.failureReason ? { failureReason: persona.failureReason } : {}),
    });
  });
}
