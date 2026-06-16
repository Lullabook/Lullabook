import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> }
): Promise<NextResponse> {
  const { candidateId } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    try {
      await ctx.storybooks.selectCandidate(member.id, candidateId);
      await ctx.persist();
      return jsonOk({ selected: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
