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
      <div className="v2-stack" style={{ gap: 18 }}>
        <div>
          <p className="v2-eyebrow">✨ Generating your storybook</p>
          <h1 className="v2-page-title">{book.brief.theme}</h1>
        </div>
        <GenerationProgress
          storybookId={book.id}
          expectedPageCount={EXPECTED_PAGE_COUNT}
          initialPages={pages.map((p) => ({
            id: p.id,
            index: p.index,
            generationStatus: p.generationStatus,
          }))}
        />
      </div>
    );
  }

  if (book.status === "failed") {
    return (
      <div className="v2-stack" style={{ gap: 18 }}>
        <div>
          <p className="v2-eyebrow">📚 Storybook</p>
          <h1 className="v2-page-title">{book.brief.theme}</h1>
        </div>
        <div className="v2-empty">
          <span className="v2-empty__icon" aria-hidden="true">
            🌧️
          </span>
          <h2 className="v2-section-title">This one didn&apos;t come together</h2>
          <p className="v2-page-lead" style={{ marginBottom: 20 }}>
            Too few pages made it through generation, so we stopped rather than
            hand you half a book. This never costs you anything.
          </p>
          <Link className="v2-btn v2-btn--primary" href="/storybooks/new">
            Try a fresh story
          </Link>
        </div>
      </div>
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
      <div className="v2-stack" style={{ gap: 18 }}>
        <div>
          <p className="v2-eyebrow">✏️ Draft — only you can see this</p>
          <h1 className="v2-page-title">{book.brief.theme}</h1>
        </div>
        <CurationBoard
          storybookId={book.id}
          pages={curationPages}
          rerollBudgetRemaining={book.rerollBudgetRemaining}
          rerollCredits={book.rerollCredits}
        />
      </div>
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
    <div className="v2-stack" style={{ gap: 18 }}>
      <div>
        <p className="v2-eyebrow">💛 Finalized keepsake</p>
        <h1 className="v2-page-title">{book.brief.theme}</h1>
      </div>
      <div className="v2-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="v2-btn v2-btn--primary" href={`/storybooks/${book.id}/read`}>
            📖 Read together
          </Link>
          <a className="v2-btn v2-btn--ghost-surface" href={`/api/storybooks/${book.id}/export`}>
            ⬇️ Download PDF
          </a>
        </div>
      </div>
      <div className="v2-card">
        <h2 style={{ margin: "0 0 8px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.3rem", color: "#2E2438" }}>
          Sharing
        </h2>
        <p style={{ margin: "0 0 16px", color: "#6E6076", fontSize: "0.92rem", lineHeight: 1.5 }}>
          Storybooks are private to your family by default. A share link exposes
          your child&apos;s likeness and name to anyone who has it — links are
          never indexed by search engines, and you can revoke them anytime.
        </p>
        <ShareControls storybookId={book.id} links={links} />
      </div>
    </div>
  );
}
