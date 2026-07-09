import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk } from "@/lib/api-route";
import { ConsentEngine } from "@/services/consent-engine";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";

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
    // Red-team fix: method-aware — a payment_vpc receipt must NOT read as
    // "verified" in an email_plus market, or the client loops between the
    // 403 gate and a status that claims it is done.
    const required = ConsentEngine.getJurisdiction(member.jurisdiction)?.consentMethod;
    if (required && ctx.store.getConsentReceiptForFamily(member.familyId, required)) {
      return jsonOk({ status: "verified" as const });
    }
    // Audit fix (FAIL-2): a link_sent older than the confirm-side TTL can
    // never be confirmed — reporting it "pending" forever strands a Guardian
    // who mistyped their email. Mirror the TTL here so stale requests read
    // "none" and the client re-shows the attest+email step.
    const now = Date.now();
    const pending = [...ctx.store.emailPlusVpcRequests.values()]
      .filter(
        (r) =>
          r.familyId === member.familyId &&
          r.status === "link_sent" &&
          now - r.requestedAt.getTime() <= EmailPlusVpcService.CONSENT_LINK_TTL_MS
      )
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
    if (pending) {
      // Red-team fix (PII): the entered email is shown to the Guardian who
      // owns the flow — never to non-guardian Household members.
      return jsonOk({
        status: "pending" as const,
        ...(member.role === "guardian" ? { email: pending.email } : {}),
      });
    }
    return jsonOk({ status: "none" as const });
  });
}
