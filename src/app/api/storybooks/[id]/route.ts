import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";

/**
 * Live-progress polling for Brief composer / reader: status plus per-Page
 * generation state, text, illustration keys, and candidates. Failed Pages
 * surface as re-rollable holes, never as a blocked book.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const authed = await resolveRequestAuth(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ctx, member } = authed;
  // Issue 100: reap any book stranded in `generating` past the watchdog budget
  // before reading, so the reader never polls an infinite "Illustrating"
  // spinner. If the reaper changes anything, persist so the next request sees
  // the terminal state without another reap pass.
  if ((await ctx.storybooks.reapStrandedGenerationsDurably()) > 0) {
    await ctx.persist();
  }
  const book = ctx.store.getStorybook(id, member.id);
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const pages = ctx.store.getPagesForStorybook(book.id).map((p) => ({
    id: p.id,
    index: p.index,
    text: p.text,
    generationStatus: p.generationStatus,
    illustrationBlobKey: p.illustrationBlobKey,
    hasIllustration: !!p.illustrationBlobKey || !!p.illustrationUrl,
    voiceClipId: p.voiceClipId ?? null,
    candidates: ctx.store.getCandidatesForPage(p.id).map((c) => ({
      id: c.id,
      kind: c.kind,
      content: c.content,
      selected: c.selected,
    })),
  }));
  return NextResponse.json({
    id: book.id,
    status: book.status,
    theme: book.brief.theme,
    storyType: book.brief.storyType,
    rerollBudgetRemaining: book.rerollBudgetRemaining,
    rerollCredits: book.rerollCredits,
    pages,
  });
}
