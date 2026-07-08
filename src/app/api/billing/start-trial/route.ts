import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/**
 * Issue 169 (ADR-0027, SEC-2) — prod-guarded `POST /api/billing/start-trial`.
 *
 * Fake-first R1 entry point: activates the 7-day Just-Us trial via
 * `SubscriptionService.activateTrial` (issue 168) and returns the fresh
 * entitlement so the client refetches in one round-trip. Idempotent by
 * construction (168 — a live subscription is returned unchanged).
 *
 * SEC-2: **refuses in production** — mirrors the `devForcedSubscription` /
 * `DEV_DEMO_SEED` guard pattern (`NODE_ENV !== "production"`), checked BEFORE
 * auth or any work, so no subscription state can ever be written in prod.
 * FAIL-2: any activation error returns a structured retryable error (4xx JSON,
 * no 500 stack) and writes no partial "paid" state (SEC-4 fail closed —
 * `activateTrial` is single-write, so a throw means nothing persisted).
 */
function isStartTrialEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isStartTrialEnabled()) {
    return NextResponse.json(
      { error: "start-trial is disabled" },
      { status: 403 }
    );
  }
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const sub = ctx.subscriptions.activateTrial(member.familyId);
      const entitlement = ctx.entitlements.getEntitlement(member.familyId);
      await ctx.persist();
      return jsonOk({
        isActive: ctx.subscriptions.isActive(member.familyId),
        trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
        entitlement: {
          tier: entitlement.tier,
          storyCap: entitlement.storyCap,
          memberCap: entitlement.memberCap,
          capabilities: {
            canNarrate: entitlement.canNarrate,
            canVideo: entitlement.canVideo,
            canCustomStyle: entitlement.canCustomStyle,
          },
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Trial activation failed";
      return jsonError(message, 400);
    }
  });
}
