import { NextResponse } from "next/server";
import { BearerAuthError, requireBearerMember } from "@/lib/bearer-auth";
import { createRequestContext } from "@/lib/context";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";
import { HomeRosterService } from "@/services/home-roster";

/** Bearer-authed cold-start home: roster + subscription flags for native app. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { ctx, member } = await requireBearerMember(
      request,
      createSupabaseJwtVerifier(),
      createRequestContext
    );
    const roster = new HomeRosterService(ctx.store).getForMember(
      member.id,
      ctx.subscriptions.isActive(member.familyId)
    );
    const selectedBaby = ctx.babies.getSelected(member.id);
    return NextResponse.json({
      member: {
        id: member.id,
        email: member.email,
        role: member.role,
        jurisdiction: member.jurisdiction,
      },
      selectedBaby: selectedBaby
        ? { id: selectedBaby.id, displayName: selectedBaby.displayName }
        : null,
      ...roster,
      trainingExpectationCopy: ctx.coldStart.trainingExpectationCopy(),
    });
  } catch (err) {
    if (err instanceof BearerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
