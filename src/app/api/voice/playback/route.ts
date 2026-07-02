import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { isR1AudioEnabled, r1CutResponse } from "@/lib/r1-config";

/** Issue 112 — Get a signed playback URL for a voice clip.
 *  Issue 145 — cut from R1: returns a clean 404 before auth when audio is cut. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isR1AudioEnabled()) return r1CutResponse("Voice clips");
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
