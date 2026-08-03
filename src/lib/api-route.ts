import { NextResponse } from "next/server";
import { BearerAuthError, requireBearerMember, type JwtVerifier } from "@/lib/bearer-auth";
import { createRequestContext, type RequestContext } from "@/lib/context";
import { RequestRecorder } from "@/lib/request-timing";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";
import type { Member } from "@/domain/types";

export async function withBearerAuth(
  request: Request,
  handler: (ctx: RequestContext, member: Member) => Promise<NextResponse>
): Promise<NextResponse> {
  // Issue 191: deterministic request timing. `auth` = JWT verify duration,
  // `hydrate` = family hydration after the context is built, `total` = whole
  // request, `db` = Supabase query/wave counts. Numbers only — never request
  // content, so no secret or personal data can enter the header.
  const timing = new RequestRecorder();
  try {
    const baseVerifier = createSupabaseJwtVerifier();
    const verifier: JwtVerifier = {
      async verify(token: string) {
        const t0 = performance.now();
        try {
          return await baseVerifier.verify(token);
        } finally {
          timing.markMs("auth", performance.now() - t0);
        }
      },
    };
    const { ctx, member } = await requireBearerMember(
      request,
      verifier,
      () => createRequestContext(timing)
    );
    timing.markHydrate();
    const response = await handler(ctx, member);
    timing.mark("total");
    return withServerTiming(response, timing);
  } catch (err) {
    if (err instanceof BearerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** Attach the recorder's Server-Timing header onto an API response. */
export function withServerTiming<T extends NextResponse>(
  response: T,
  timing?: RequestRecorder
): T {
  // The route seam already guarantees a NextResponse. Avoid an instanceof
  // guard here: responses can cross an Edge/Node realm boundary while still
  // carrying the standard Headers interface.
  if (timing) {
    response.headers.set("Server-Timing", timing.toServerTiming());
  }
  return response;
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Issue 171 (SEC-1) — domain errors that carry an HTTP status and a machine
 * code (EntitlementError `not_entitled`/`create_not_allowed`, StoryCapError
 * `story_cap_reached`) must cross the wire WITH the code, so the mobile
 * client can route 403s to the paywall without message-sniffing. The server
 * stays the only entitlement boundary — errors without a code keep the
 * caller-supplied fallback status and get no code field.
 */
const DOMAIN_ERROR_CODES = new Set([
  "not_entitled",
  "create_not_allowed",
  "story_cap_reached",
  // Issue 172: ConsentRequiredError — mobile routes this to the consent
  // flow (issue 173), NOT the paywall. Payment never satisfies consent.
  "consent_required",
  // Issue 168 audit fix: one trial per family ever — mobile routes this to
  // the real purchase paywall, never a retry of start-trial.
  "trial_already_used",
]);

export function jsonDomainError(err: unknown, fallbackStatus = 400): NextResponse {
  const message = err instanceof Error ? err.message : "Failed";
  if (err && typeof err === "object" && "status" in err && "code" in err) {
    const { status, code } = err as { status: unknown; code: unknown };
    // Whitelisted: third-party errors (Postgrest etc.) also carry status/code
    // fields — never let an internal code or message-status leak to clients.
    if (typeof status === "number" && typeof code === "string" && DOMAIN_ERROR_CODES.has(code)) {
      return NextResponse.json({ error: message, code }, { status });
    }
  }
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
