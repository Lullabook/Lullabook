import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonDomainError } from "@/lib/api-route";

/**
 * Issue 217 (ENT-1, SEC-1, SEC-5) — a prod-guarded, server-authoritative demo
 * Pro grant for the iPad Simulator demo.
 *
 * The demo needs full Pro access, but the Simulator has no native purchase
 * client, so a real RevenueCat purchase cannot complete there. This endpoint
 * grants a Pro entitlement to the authenticated Guardian's own Family via
 * `SubscriptionService.grantDemoPro`, which writes the SAME active
 * Subscription row a real RevenueCat purchase writes — so every gated route
 * still evaluates the entitlement gate per request (`isActive` →
 * `subscriptionIsLive` → `getTier`). It is a grant, not a bypass.
 *
 * Hardening:
 *  - SEC-5 fail closed: refused in production unless the explicit
 *    `LULLABOOK_DEMO_PRO_GRANT=true` opt-in is set, checked BEFORE any auth or
 *    work so no subscription state can ever be written.
 *  - SEC-1: the client NEVER supplies an entitlement value — only an `action`
 *    (`grant`|`revoke`). A forged client claim is ignored; the server store
 *    always wins.
 *  - Guardian boundary: only the authenticated Guardian may toggle their own
 *    Family's demo grant; familyId is derived from the verified JWT.
 */
function isDemoProGrantEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.LULLABOOK_DEMO_PRO_GRANT === "true";
  }
  return true; // dev / test harness
}

const ACTIONS = new Set(["grant", "revoke"]);

export async function POST(request: Request): Promise<NextResponse> {
  if (!isDemoProGrantEnabled()) {
    return NextResponse.json({ error: "demo-pro grant is disabled" }, { status: 403 });
  }
  return withBearerAuth(request, async (ctx, member) => {
    try {
      if (member.role !== "guardian") {
        return NextResponse.json(
          { error: "Only the Guardian can manage the demo Pro grant" },
          { status: 403 },
        );
      }
      const body = (await request.json().catch(() => null)) as { action?: string } | null;
      const action = body?.action;
      if (typeof action !== "string" || !ACTIONS.has(action)) {
        return NextResponse.json({ error: "invalid action" }, { status: 400 });
      }

      if (action === "grant") {
        ctx.subscriptions.grantDemoPro(member.familyId);
      } else {
        ctx.subscriptions.revokeDemoPro(member.familyId);
      }
      await ctx.persist();

      return jsonOk({
        familyId: member.familyId,
        action,
        isActive: ctx.subscriptions.isActive(member.familyId),
        tier: ctx.entitlements.getTier(member.familyId),
      });
    } catch (err) {
      return jsonDomainError(err, 400);
    }
  });
}
