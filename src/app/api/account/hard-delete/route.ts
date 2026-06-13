import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const { confirmation } = (await request.json()) as { confirmation: string };
    if (confirmation !== "DELETE") {
      return jsonError('Type "DELETE" to confirm', 400);
    }
    try {
      await ctx.hardDelete.hardDelete(member.id);
      await ctx.persist();
      return jsonOk({ deleted: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
