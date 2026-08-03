import { getAuthedContext, type AuthedContext } from "@/lib/auth";
import { BearerAuthError, requireBearerMember, type JwtVerifier } from "@/lib/bearer-auth";
import { createRequestContext } from "@/lib/context";
import { RequestRecorder } from "@/lib/request-timing";
import { createAuthClient } from "@/lib/supabase";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";
import type { HydrationProfile } from "@/db/store";

async function resolveCookieAuth(profile?: HydrationProfile): Promise<AuthedContext | null> {
  if (profile === undefined) return getAuthedContext();

  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const ctx = createRequestContext();
  let member = await ctx.store.hydrateByAuthUser(user.id, profile);
  if (!member) {
    member = ctx.onboarding.ensureFamilyForNewUser(
      user.id,
      user.email ?? "",
      (user.user_metadata?.jurisdiction as string | undefined) ?? "US"
    );
    await ctx.persist();
  }
  return { ctx, member };
}

/**
 * Cookie session (web) or Bearer JWT (native) — whichever the request
 * carries. `profile` lets read-only blob routes request the minimal
 * authenticated Family lookup (issue 192); the bearer seam otherwise picks
 * read for GET and full for writes.
 */
export async function resolveRequestAuth(
  request: Request,
  profile?: HydrationProfile
): Promise<AuthedContext | null> {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    // Issue 191: record auth/hydrate/total on the request context's recorder
    // (the same one passed into createRequestContext), so the native bearer
    // path carries the same timing breadcrumb as the withBearerAuth seam.
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
        () => createRequestContext(timing),
        profile
      );
      timing.markHydrate();
      timing.mark("total");
      return { ctx, member };
    } catch (err) {
      if (err instanceof BearerAuthError) return null;
      throw err;
    }
  }
  const authed = await resolveCookieAuth(profile);
  if (authed) {
    authed.ctx.timing?.mark("total");
  }
  return authed;
}
