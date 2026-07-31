import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/**
 * Issue 125 — Mobile likeness-confirmation route. A Guardian confirms they have
 * reviewed the sample generations for a trained Persona before any book-
 * generation spend. The gate is server-enforced (storybook.generate throws when
 * `likenessConfirmed !== true`) and persisted (migration 011).
 *
 * Baby likeness requires a Guardian; a linked Adult subject confirms their own
 * likeness. PersonaService.acceptLikeness enforces the subject-aware boundary.
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
      // Likeness acceptance must be durable before a waiting Brief can claim
      // allowance or enqueue provider work.
      await ctx.persist();
      await ctx.coldStart.onPersonaReady(id);
      return jsonOk({ ok: true, personaId: id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      const status = /not ready|guardian/i.test(message) ? 400 : 400;
      return jsonError(message, status);
    }
  });
}
