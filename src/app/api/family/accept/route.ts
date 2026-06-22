import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/** Issue 110 — Accept an invite by token (creates Member in inviter's Household). */
export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, _member) => {
    try {
      const body = (await request.json()) as { token: string };
      if (!body.token) return jsonError("Missing token", 400);
      // The Bearer auth already resolved the auth user — use their authUserId
      // to accept the invite into the inviter's Household.
      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.replace("Bearer ", "").trim();
      // Re-derive the authUserId from the already-resolved member context
      // (the bearer auth hydrated the member; we need the authUserId).
      // For a new invitee, the member may have been auto-onboarded into a
      // solo Family — we need to move them. The accept creates a new Member
      // in the inviter's Household.
      const { createSupabaseJwtVerifier } = await import("@/lib/supabase-jwt");
      const verifier = createSupabaseJwtVerifier();
      const claims = await verifier.verify(token);
      const newMember = ctx.family.acceptInvite(body.token, claims.sub);
      await ctx.persist();
      return jsonOk({ memberId: newMember.id, familyId: newMember.familyId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      const status = message.includes("not found") || message.includes("expired") || message.includes("used")
        ? 410
        : 400;
      return jsonError(message, status);
    }
  });
}
