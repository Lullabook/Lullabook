import { NextResponse } from "next/server";
import { BearerAuthError, requireBearerMember } from "@/lib/bearer-auth";
import { createRequestContext, type RequestContext } from "@/lib/context";
import { createSupabaseJwtVerifier } from "@/lib/supabase-jwt";
import type { Member } from "@/domain/types";

export async function withBearerAuth(
  request: Request,
  handler: (ctx: RequestContext, member: Member) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const { ctx, member } = await requireBearerMember(
      request,
      createSupabaseJwtVerifier(),
      createRequestContext
    );
    return await handler(ctx, member);
  } catch (err) {
    if (err instanceof BearerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
