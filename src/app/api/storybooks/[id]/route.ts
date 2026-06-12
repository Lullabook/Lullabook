import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/auth";

/**
 * Live-progress polling for the Brief composer / curation view: status plus
 * per-Page generation state. Failed or quarantined Pages surface as
 * re-rollable holes, never as a blocked book.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const authed = await getAuthedContext();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ctx, member } = authed;
  const book = ctx.store.getStorybook(id, member.id);
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const pages = ctx.store
    .getPagesForStorybook(book.id)
    .map((p) => ({
      id: p.id,
      index: p.index,
      generationStatus: p.generationStatus,
      hasIllustration: !!p.illustrationBlobKey || !!p.illustrationUrl,
    }));
  return NextResponse.json({
    id: book.id,
    status: book.status,
    rerollBudgetRemaining: book.rerollBudgetRemaining,
    rerollCredits: book.rerollCredits,
    pages,
  });
}
