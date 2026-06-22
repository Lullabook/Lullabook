import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/** Issue 112 — Upload a voice clip (requires prior consent + narrate capability). */
export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const body = (await request.json()) as {
        personaId: string;
        label: string;
        transcript: string;
        durationSecs: number;
        audioBytes: string; // base64
      };
      if (!body.personaId || !body.audioBytes) {
        return jsonError("Missing personaId or audioBytes", 400);
      }
      const clip = await ctx.voiceClips.uploadClip({
        memberId: member.id,
        personaId: body.personaId,
        label: body.label,
        transcript: body.transcript,
        durationSecs: body.durationSecs,
        audioBytes: Buffer.from(body.audioBytes, "base64"),
      });
      await ctx.persist();
      return jsonOk({ clip }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      const status = message.includes("consent") || message.includes("capability") || message.includes("subscription")
        ? 403
        : 400;
      return jsonError(message, status);
    }
  });
}
