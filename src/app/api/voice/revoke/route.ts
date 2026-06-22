import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/** Issue 112 — Revoke voice consent (deletes clips + blobs). */
export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const body = (await request.json()) as { personaId: string };
      if (!body.personaId) return jsonError("Missing personaId", 400);
      await ctx.voiceClips.revokeConsent(member.id, body.personaId);
      await ctx.persist();
      return jsonOk({ revoked: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
