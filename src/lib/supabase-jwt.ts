import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JwtVerifier } from "@/lib/bearer-auth";
import { optionalEnv } from "@/adapters/env";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function jwksUrl(): string {
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for JWT verification");
  return `${url}/auth/v1/.well-known/jwks.json`;
}

/** Production JWT verifier against the Supabase project JWKS. */
export function createSupabaseJwtVerifier(): JwtVerifier {
  return {
    verify: async (token) => {
      if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl()));
      const { payload } = await jwtVerify(token, jwks);
      if (!payload.sub) throw new Error("Missing sub claim");
      // SEC (172 red-team): jurisdiction MUST come from app_metadata, which
      // only the service role can write. user_metadata is client-writable
      // (auth.updateUser), so trusting it let a US_IOS user claim "US" and
      // convert a Stripe payment receipt into a COPPA consent bypass.
      const appMeta = payload.app_metadata as { jurisdiction?: string } | undefined;
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
        jurisdiction: typeof appMeta?.jurisdiction === "string" ? appMeta.jurisdiction : undefined,
      };
    },
  };
}
