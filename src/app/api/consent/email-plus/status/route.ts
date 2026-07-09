import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk } from "@/lib/api-route";

/**
 * Issue 173 — mobile consent-flow resume point.
 *
 * Read-only status of the Household's Email-Plus VPC state, so a client that
 * was closed mid-flow reopens at the correct step (never a dead end):
 *   - "verified": a consent receipt exists for the family (172's gate clears).
 *   - "pending":  a consent link was sent but not yet confirmed.
 *   - "none":     nothing in flight (includes revoked / failed-before-send —
 *                 the client shows the attest+email step so send can be retried).
 *
 * ADR-0018 / privacy: the only PII returned is the email the Guardian
 * themselves entered on this device's flow — never receipt contents.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    if (ctx.store.getConsentReceiptForFamily(member.familyId)) {
      return jsonOk({ status: "verified" as const });
    }
    const pending = [...ctx.store.emailPlusVpcRequests.values()]
      .filter((r) => r.familyId === member.familyId && r.status === "link_sent")
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
    if (pending) {
      // Guardian's own entered email only — lets the pending screen say
      // "we emailed you@x" after an app restart.
      return jsonOk({ status: "pending" as const, email: pending.email });
    }
    return jsonOk({ status: "none" as const });
  });
}
