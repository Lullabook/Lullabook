import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
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
      const message = err instanceof Error ? err.message : "Failed";
      const status = message.includes("subscription") ? 402 : 400;
      return jsonError(message, status);
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
