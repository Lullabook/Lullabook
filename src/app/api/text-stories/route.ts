import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonDomainError } from "@/lib/api-route";
import type { TextStoryBrief } from "@/domain/types";

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const brief = (await request.json()) as TextStoryBrief;
    try {
      const story = await ctx.textStories.generate(member.id, brief);
      await ctx.persist();
      return jsonOk({ storyId: story.id, text: story.text });
    } catch (err) {
      // Issue 171 (SEC-1): 403 + entitlement code crosses the wire intact.
      return jsonDomainError(err);
    }
  });
}
