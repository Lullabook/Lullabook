import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { CurationBoard, type CurationPage } from "@/components/curation-board";
import { GenerationProgress } from "@/components/generation-progress";
import { ShareControls, type ShareLinkView } from "@/components/share-controls";

export const metadata: Metadata = { title: "Storybook" };

const EXPECTED_PAGE_COUNT = 12;

function imageSrc(blobKey: string | null, url: string | null): string | null {
  if (blobKey) return `/api/images?key=${encodeURIComponent(blobKey)}`;
  return url;
}

export default async function StorybookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, member } = await requireAuthedContext();

  let book;
  try {
    book = ctx.store.getStorybook(id, member.id);
  } catch {
    notFound();
  }
  if (!book) notFound();

  const pages = ctx.store.getPagesForStorybook(book.id);

  if (book.status === "generating") {
    return (
      <>
        <p className="eyebrow">Storybook</p>
        <h1>{book.brief.theme}</h1>
        <GenerationProgress
          storybookId={book.id}
          expectedPageCount={EXPECTED_PAGE_COUNT}
          initialPages={pages.map((p) => ({
            id: p.id,
            index: p.index,
            generationStatus: p.generationStatus,
          }))}
        />
      </>
    );
  }

  if (book.status === "failed") {
    return (
      <>
        <p className="eyebrow">Storybook</p>
        <h1>{book.brief.theme}</h1>
        <div className="card empty-state">
          <span className="moon" aria-hidden="true">
            🌧️
          </span>
          <h2>This one didn&apos;t come together</h2>
          <p className="muted">
            Too few pages made it through generation, so we stopped rather
            than hand you half a book. This never costs you anything.
          </p>
          <Link className="btn btn-primary" href="/storybooks/new">
            Try a fresh Brief
          </Link>
        </div>
      </>
    );
  }

  if (book.status === "draft") {
    const curationPages: CurationPage[] = pages.map((p) => ({
      id: p.id,
      index: p.index,
      text: p.text,
      generationStatus: p.generationStatus,
      imageSrc:
        p.generationStatus === "ready"
          ? imageSrc(p.illustrationBlobKey, p.illustrationUrl)
          : null,
      candidates: ctx.store.getCandidatesForPage(p.id).map((c) => ({
        id: c.id,
        kind: c.kind,
        content: c.content,
        selected: c.selected,
      })),
    }));

    return (
      <>
        <div className="row between">
          <div>
            <p className="eyebrow">Draft — only you can see this</p>
            <h1>{book.brief.theme}</h1>
          </div>
        </div>
        <CurationBoard
          storybookId={book.id}
          pages={curationPages}
          rerollBudgetRemaining={book.rerollBudgetRemaining}
          rerollCredits={book.rerollCredits}
        />
      </>
    );
  }

  // Finalized
  const links: ShareLinkView[] = [...ctx.store.shareLinks.values()]
    .filter((l) => l.storybookId === book.id)
    .map((l) => ({
      id: l.id,
      url: `/share/${l.token}`,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      hasPasscode: !!l.passcodeHash,
      revoked: !!l.revokedAt,
    }));

  return (
    <>
      <p className="eyebrow">Finalized keepsake</p>
      <h1>{book.brief.theme}</h1>
      <div className="card">
        <div className="row">
          <Link className="btn btn-primary" href={`/storybooks/${book.id}/read`}>
            Read together
          </Link>
          <a className="btn btn-secondary" href={`/api/storybooks/${book.id}/export`}>
            Download PDF
          </a>
        </div>
      </div>
      <div className="card">
        <h2>Sharing</h2>
        <p className="subtle">
          Storybooks are private to your Family by default. A share link
          exposes your child&apos;s likeness and name to anyone who has it —
          links are never indexed by search engines, and you can revoke them
          anytime.
        </p>
        <ShareControls storybookId={book.id} links={links} />
      </div>
    </>
  );
}
