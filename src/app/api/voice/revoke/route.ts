import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { isR1AudioEnabled, r1CutResponse } from "@/lib/r1-config";

/** Issue 112 — Revoke voice consent (deletes clips + blobs).
 *  Issue 145 — cut from R1: returns a clean 404 before auth when audio is cut. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isR1AudioEnabled()) return r1CutResponse("Voice clips");
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
