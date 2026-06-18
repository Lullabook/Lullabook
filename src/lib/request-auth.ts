import { getAuthedContext, type AuthedContext } from "@/lib/auth";
import { BearerAuthError, requireBearerMember } from "@/lib/bearer-auth";
import { createRequestContext } from "@/lib/context";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";

/** Cookie session (web) or Bearer JWT (native) — whichever the request carries. */
export async function resolveRequestAuth(request: Request): Promise<AuthedContext | null> {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      const { ctx, member } = await requireBearerMember(
        request,
        createSupabaseJwtVerifier(),
        createRequestContext
      );
      return { ctx, member };
    } catch (err) {
      if (err instanceof BearerAuthError) return null;
      throw err;
    }
  }
  return getAuthedContext();
}
