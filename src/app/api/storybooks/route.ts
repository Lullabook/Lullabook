import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError, jsonDomainError } from "@/lib/api-route";
import type { Brief, Storybook } from "@/domain/types";

function serializeStorybook(book: Storybook) {
  return {
    id: book.id,
    familyId: book.familyId,
    babyId: book.babyId,
    status: book.status,
    theme: book.brief.theme,
    storyType: book.brief.storyType,
    createdAt: book.createdAt.toISOString(),
    finalizedAt: book.finalizedAt?.toISOString() ?? null,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const brief = (await request.json()) as Brief;
    try {
      const book = await ctx.storybooks.generate(member.id, brief);
      await ctx.persist();
      return jsonOk({ storybookId: book.id, status: book.status }, 201);
    } catch (err) {
      // Issue 100: the service forces a failed generation terminal in-memory
      // (runGenerationBody backstop). Persist that terminal state so a fresh
      // reader poll on a new request context never sees a stranded `generating`
      // book. Best-effort — never mask the original error.
      try {
        await ctx.persist();
      } catch {
        /* ignore sync failure; surface the original error */
      }
      // Issue 171 (SEC-1): entitlement/cap failures cross the wire as 403 +
      // machine code so the client can route to the paywall without message
      // sniffing; everything else keeps the legacy status mapping.
      const message = err instanceof Error ? err.message : "Failed";
      return jsonDomainError(err, message.includes("subscription") ? 402 : 400);
    }
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const babyId = new URL(request.url).searchParams.get("babyId");
    try {
      const books = babyId
        ? ctx.store.listStorybooksForBaby(babyId, member.id)
        : ctx.store.listStorybooksForFamily(member.familyId, member.id);
      return jsonOk({ storybooks: books.map(serializeStorybook) });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
