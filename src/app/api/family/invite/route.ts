import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { isR1MultiFamilyEnabled, r1CutResponse } from "@/lib/r1-config";

/** Issue 109 — Guardian sends an invite (mints token + sends email).
 *  Issue 146 — cut from R1: multi-family disabled → clean 404 before auth. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isR1MultiFamilyEnabled()) return r1CutResponse("Family invites");
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const body = (await request.json()) as { email: string };
      if (!body.email) return jsonError("Missing email", 400);
      const result = ctx.family.inviteMember(member.id, body.email);
      await ctx.persist();
      return jsonOk(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      return jsonError(message, message.includes("guardian") ? 403 : 400);
    }
  });
}
