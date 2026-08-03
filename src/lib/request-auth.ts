import { getAuthedContext, type AuthedContext } from "@/lib/auth";
import { BearerAuthError, requireBearerMember, type JwtVerifier } from "@/lib/bearer-auth";
import { createRequestContext } from "@/lib/context";
import { RequestRecorder } from "@/lib/request-timing";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";

/** Cookie session (web) or Bearer JWT (native) — whichever the request carries. */
export async function resolveRequestAuth(request: Request): Promise<AuthedContext | null> {
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
        () => createRequestContext(timing)
      );
      timing.markHydrate();
      timing.mark("total");
      return { ctx, member };
    } catch (err) {
      if (err instanceof BearerAuthError) return null;
      throw err;
    }
  }
  const authed = await getAuthedContext();
  if (authed) {
    authed.ctx.timing?.mark("total");
  }
  return authed;
}
