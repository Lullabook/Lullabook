import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/**
 * Issue 125 / LUL-105 — Mobile likeness-confirmation route. A trained Persona's
 * likeness is confirmed by the authorized actor (Guardian for Baby Personas;
 * the Adult subject for their own Self Persona). Confirmation flips the gate and
 * immediately attempts to resume any waiting Briefs for this Persona.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const persona = ctx.store.getPersona(id, member.id);
    if (!persona) return jsonError("Persona not found", 404);
    try {
      ctx.personas.acceptLikeness(id, member.id);
      try {
        await ctx.coldStart.onPersonaReady(id);
      } catch {
        // Resume failure is recoverable: the accepted Persona is still durable,
        // and the pending Brief remains retryable after the lease expires.
      }
      await ctx.persist();
      return jsonOk({ ok: true, personaId: id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      const status = /not ready|guardian/i.test(message) ? 400 : 400;
      return jsonError(message, status);
    }
  });
}
