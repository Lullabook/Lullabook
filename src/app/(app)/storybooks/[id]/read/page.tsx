import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { Reader } from "@/components/reader";

export const metadata: Metadata = { title: "Read" };

export default async function ReadStorybookPage({
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

  const pages = ctx.store.getPagesForStorybook(book.id).map((p) => ({
    index: p.index,
    text: p.text,
    imageSrc: p.illustrationBlobKey
      ? `/api/images?key=${encodeURIComponent(p.illustrationBlobKey)}`
      : p.illustrationUrl,
  }));

  return (
    <div className="v2-stack" style={{ gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="v2-eyebrow">📖 Read together</p>
          <h1 className="v2-page-title">{book.brief.theme}</h1>
        </div>
        <Link className="v2-btn v2-btn--ghost-surface" href={`/storybooks/${book.id}`}>
          Details
        </Link>
      </div>
      <Reader title={book.brief.theme} pages={pages} />
    </div>
  );
}
