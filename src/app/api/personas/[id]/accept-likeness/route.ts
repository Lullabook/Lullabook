import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/**
 * Issue 125 — Mobile likeness-confirmation route. A Guardian confirms they have
 * reviewed the sample generations for a trained Persona before any book-
 * generation spend. The gate is server-enforced (storybook.generate throws when
 * `likenessConfirmed !== true`) and persisted (migration 011).
 *
 * Only the Guardian may confirm (corollary of "only a Guardian may create a
 * Baby Persona"); enforced inside PersonaService.acceptLikeness.
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
      await ctx.persist();
      return jsonOk({ ok: true, personaId: id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      const status = /not ready|guardian/i.test(message) ? 400 : 400;
      return jsonError(message, status);
    }
  });
}
