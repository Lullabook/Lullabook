import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/** Issue 109 — Guardian sends an invite (mints token + sends email). */
export async function POST(request: Request): Promise<NextResponse> {
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
