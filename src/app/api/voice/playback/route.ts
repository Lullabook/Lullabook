import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/** Issue 112 — Get a signed playback URL for a voice clip. */
export async function GET(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const clipId = new URL(request.url).searchParams.get("clipId");
      if (!clipId) return jsonError("Missing clipId", 400);
      const url = await ctx.voiceClips.getPlaybackUrl(member.id, clipId);
      return jsonOk({ url });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
