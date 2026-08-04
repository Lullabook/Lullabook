import { NextResponse } from "next/server";
import { RlsViolationError } from "@/db/store";
import { withBearerAuth, jsonError } from "@/lib/api-route";

/** Resolve a Storybook page image without exposing its storage/provider key. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
): Promise<NextResponse> {
  const { pageId } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const page = ctx.store.pages.get(pageId);
    if (!page) return jsonError("Image not found", 404);

    try {
      const book = ctx.store.getStorybook(page.storybookId, member.id);
      if (!book || !page.illustrationBlobKey) return jsonError("Image not found", 404);
      const signedUrl = await ctx.blobs.signedUrl(page.illustrationBlobKey);
      const response = NextResponse.redirect(signedUrl, 307);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      if (error instanceof RlsViolationError) return jsonError("Image not found", 404);
      throw error;
    }
  });
}
