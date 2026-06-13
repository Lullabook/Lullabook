import type { Member } from "@/domain/types";
import type { RequestContext } from "@/lib/context";

export interface JwtClaims {
  sub: string;
  email?: string;
  jurisdiction?: string;
}

export interface JwtVerifier {
  verify(token: string): Promise<JwtClaims>;
}

export class BearerAuthError extends Error {
  constructor(
    message: string,
    readonly status = 401
  ) {
    super(message);
    this.name = "BearerAuthError";
  }
}

async function resolveMember(
  ctx: RequestContext,
  claims: JwtClaims
): Promise<Member> {
  const store = ctx.store as RequestContext["store"] & {
    hydrateByAuthUser?: (authUserId: string) => Promise<Member | undefined>;
  };

  if (store.hydrateByAuthUser) {
    let member = await store.hydrateByAuthUser(claims.sub);
    if (!member) {
      member = ctx.onboarding.ensureFamilyForNewUser(
        claims.sub,
        claims.email ?? "",
        claims.jurisdiction ?? "US"
      );
      await ctx.persist();
    }
    return member;
  }

  let member = ctx.store.getMemberByAuthUserId(claims.sub);
  if (!member) {
    member = ctx.onboarding.ensureFamilyForNewUser(
      claims.sub,
      claims.email ?? "",
      claims.jurisdiction ?? "US"
    );
  }
  return member;
}

/** Verify Bearer JWT and hydrate Member + Family into a request context. */
export async function requireBearerMember(
  request: Request,
  verifier: JwtVerifier,
  createCtx: () => RequestContext
): Promise<{ ctx: RequestContext; member: Member }> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new BearerAuthError("Missing bearer token");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new BearerAuthError("Missing bearer token");
  }

  let claims: JwtClaims;
  try {
    claims = await verifier.verify(token);
  } catch {
    throw new BearerAuthError("Invalid token");
  }

  const ctx = createCtx();
  const member = await resolveMember(ctx, claims);
  return { ctx, member };
}
