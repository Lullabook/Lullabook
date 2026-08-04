import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";
import { RlsViolationError } from "@/db/store";

/**
 * Issue 160 (PRD v18) — finalize a draft Storybook (draft → finalized, one-way).
 * Thin route over the existing `StorybookService.finalize`; no domain logic here.
 * Uses `resolveRequestAuth` (cookie session OR Bearer JWT) because the shipping
 * caller is the native app, which authenticates with a bearer token — same as
 * the reader's GET route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const authed = await resolveRequestAuth(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ctx, member } = authed;
  try {
    const book = await ctx.storybooks.finalizeAsync(member.id, id);
    await ctx.persist();
    return NextResponse.json({ finalized: true, status: book.status });
  } catch (err) {
    // Tenant isolation: the dev store's RlsViolationError names "another
    // family" — surfacing it would let a stranger distinguish an existing
    // book from a nonexistent id (existence oracle). Map it to the same
    // not-found shape the service uses for unknown ids.
    if (err instanceof RlsViolationError) {
      return NextResponse.json({ error: "Storybook not found" }, { status: 400 });
    }
    // Service throws plain Errors ("Storybook not found", "Only drafts can be
    // finalized") — surface the message as a 400, never a 500 (E4: the book is
    // untouched on any rejection).
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Finalize failed" },
      { status: 400 }
    );
  }
}
