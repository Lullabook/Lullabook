import { NextResponse } from "next/server";
import { BearerAuthError, requireBearerMember } from "@/lib/bearer-auth";
import { createRequestContext } from "@/lib/context";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";
import { R1_PLAN_DEFINITION } from "@/domain/plan";

/** Bearer-authed entitlement + cap + credit state for the current Household. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { ctx, member } = await requireBearerMember(
      request,
      createSupabaseJwtVerifier(),
      createRequestContext
    );

    const capUsage = ctx.storyCap.getUsage(member.familyId, member.id);

    return NextResponse.json({
      // ADR-0028: one server-authoritative plan definition drives every R1 surface.
      plan: R1_PLAN_DEFINITION,
      usage: {
        storybooks: {
          count: capUsage.count,
          remaining: capUsage.remaining,
          resetDate: capUsage.resetDate,
        },
      },
    });
  } catch (err) {
    if (err instanceof BearerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
