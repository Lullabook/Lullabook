import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const { ctx, member } = await requireAuthedContext();
  const books = ctx.sharing
    .listVisibleStorybooks(member.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const personas = ctx.roster.listForCurrentFamily(member.id);
  const subscribed = ctx.subscriptions.isActive(member.familyId);

  if (books.length === 0) {
    return (
      <div className="empty-state card">
        <span className="moon" aria-hidden="true">
          ✨
        </span>
        <h1>Your shelf is waiting for its first story</h1>
        {personas.some((p) => p.status === "ready") ? (
          <>
            <p className="muted">
              Your personas are ready — compose a Brief and watch a storybook
              appear, page by page.
            </p>
            <Link className="btn btn-primary" href="/storybooks/new">
              Create a Storybook
            </Link>
          </>
        ) : personas.some((p) => p.status === "training") ? (
          <>
            <p className="muted">
              A persona is still training (about 5 minutes). You can compose
              your Brief now — we&apos;ll start the book the moment it&apos;s
              ready.
            </p>
            <Link className="btn btn-primary" href="/storybooks/new">
              Compose a Brief
            </Link>
          </>
        ) : (
          <>
            <p className="muted" style={{ maxWidth: 460, margin: "0 auto 1.5rem" }}>
              The fastest first story needs no photos at all: describe someone
              your little one loves, and we&apos;ll write a story starring them
              tonight.
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" href="/characters/new">
                Create a free Character
              </Link>
              {subscribed ? (
                <Link className="btn btn-secondary" href="/personas/new">
                  Add an illustrated Persona
                </Link>
              ) : (
                <Link className="btn btn-ghost" href="/billing">
                  See illustrated plans
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Library</h1>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href="/storybooks/classics">
            Personalized Classics
          </Link>
          <Link className="btn btn-primary btn-sm" href="/storybooks/new">
            New Storybook
          </Link>
        </div>
      </div>
      <div className="shelf">
        {books.map((book) => (
          <Link
            key={book.id}
            className="book-cover"
            href={
              book.status === "finalized"
                ? `/storybooks/${book.id}/read`
                : `/storybooks/${book.id}`
            }
          >
            <span className={`badge badge-${book.status}`}>{book.status}</span>
            <span>
              <span className="title">{book.brief.theme}</span>
              <span className="subtle" style={{ display: "block", marginTop: 4 }}>
                {book.createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
