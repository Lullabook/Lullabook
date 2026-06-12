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
    <>
      <div className="row between" style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>{book.brief.theme}</h1>
        <Link className="btn btn-ghost btn-sm" href={`/storybooks/${book.id}`}>
          Details
        </Link>
      </div>
      <Reader title={book.brief.theme} pages={pages} />
    </>
  );
}
