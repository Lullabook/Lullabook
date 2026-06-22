import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/** Issue 112 — List voice clips for a persona. */
export async function GET(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const personaId = new URL(request.url).searchParams.get("personaId");
      if (!personaId) return jsonError("Missing personaId", 400);
      const clips = ctx.voiceClips.listForPersona(member.id, personaId);
      return jsonOk({ clips });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
