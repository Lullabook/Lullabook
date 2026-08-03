import { NextResponse } from "next/server";
import { RlsViolationError } from "@/db/store";
import { resolveRequestAuth } from "@/lib/request-auth";
import { deriveStorybookProgress } from "@/lib/storybook-progress";
import { matchesIfNoneMatch, storybookResponseEtag } from "@/lib/storybook-etag";
import type { Storybook } from "@/domain/types";

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
  let book: Storybook | undefined;
  try {
    book = ctx.store.getStorybook(id, member.id);
  } catch (error) {
    // Family isolation must not turn a cross-Family existence probe into a
    // 500 or expose the store's domain error. Match the missing-id shape.
    if (error instanceof RlsViolationError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Issue 100: only an authorized Storybook read may trigger the global
  // watchdog. Reaping before this ownership check lets a cross-Family probe
  // mutate another Family's generation and allowance as a side effect.
  if ((await ctx.storybooks.reapStrandedGenerationsDurably()) > 0) {
    await ctx.persist();
  }
  const pages = ctx.store.getPagesForStorybook(book.id);
  const pageWire = pages.map((p) => ({
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
  // Issue 187 — server-derived progress: phase + ready/planned Page counts
  // drive the reader while `generating`, so it never guesses from client
  // state and stops polling on terminal phases.
  const progress = deriveStorybookProgress({
    status: book.status,
    brief: book.brief,
    pages,
    hasPersistedText: Boolean(ctx.store.getPersistedGeneration(book.id)),
  });
  const payload = {
    id: book.id,
    status: book.status,
    theme: book.brief.theme,
    storyType: book.brief.storyType,
    rerollBudgetRemaining: book.rerollBudgetRemaining,
    rerollCredits: book.rerollCredits,
    progress,
    pages: pageWire,
  };
  const etag = storybookResponseEtag(payload);
  if (matchesIfNoneMatch(request.headers.get("If-None-Match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }
  const response = NextResponse.json(payload);
  response.headers.set("ETag", etag);
  response.headers.set("Cache-Control", "private, no-cache");
  return response;
}
