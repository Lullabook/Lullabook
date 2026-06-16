import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
): Promise<NextResponse> {
  const { pageId } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    try {
      ctx.storybooks.rerollImage(member.id, pageId);
      await ctx.persist();
      return jsonOk({ rerolled: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
