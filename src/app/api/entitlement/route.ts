import { NextResponse } from "next/server";
import { BearerAuthError, requireBearerMember } from "@/lib/bearer-auth";
import { createRequestContext } from "@/lib/context";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";

/** Bearer-authed entitlement + cap + credit state for the current Household. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { ctx, member } = await requireBearerMember(
      request,
      createSupabaseJwtVerifier(),
      createRequestContext
    );

    const entitlement = ctx.entitlements.getEntitlement(member.familyId);
    const capUsage = ctx.storyCap.getUsage(member.familyId, member.id);
    const creditBalance = ctx.credits.getBalance(member.familyId);

    return NextResponse.json({
      tier: entitlement.tier,
      storyCap: {
        count: capUsage.count,
        cap: capUsage.cap,
        remaining: capUsage.remaining,
        resetDate: capUsage.resetDate,
      },
      memberCap: entitlement.memberCap,
      capabilities: {
        canNarrate: entitlement.canNarrate,
        canVideo: entitlement.canVideo,
        canCustomStyle: entitlement.canCustomStyle,
      },
      credits: {
        videoIncluded: creditBalance.videoIncluded,
        customStyleIncluded: creditBalance.customStyleIncluded,
        purchased: creditBalance.purchased,
        resetDate: creditBalance.resetDate,
      },
    });
  } catch (err) {
    if (err instanceof BearerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
