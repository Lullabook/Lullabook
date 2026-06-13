import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { bookHref, resumeHref } from "@/lib/book-nav";
import { castLabel } from "@/lib/cast-label";
import { StoriesShelf, type ShelfBook, type ContinueReading } from "@/components/v2/stories-shelf";

export const metadata: Metadata = { title: "Stories" };

function formatBookDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function StoriesPage() {
  const { ctx, member } = await requireAuthedContext();
  const baby = ctx.babies.getSelected(member.id) ?? ctx.babies.ensureDefaultBaby(member.id);
  const books = ctx.store
    .listStorybooksForBaby(baby.id, member.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const readyCast =
    ctx.store
      .getPersonasByFamily(member.familyId, member.id)
      .filter((p) => p.status === "ready").length +
    ctx.store.getCharactersByFamily(member.familyId, member.id).length;

  const shelfBooks: ShelfBook[] = books.map((b) => ({
    id: b.id,
    title: b.brief.theme || "Untitled story",
    status: b.status,
    cast: castLabel(ctx, b, member.id),
    date: formatBookDate(b.createdAt),
    href: bookHref(b.status, b.id),
  }));

  const mostRecentFinalized = books.find((b) => b.status === "finalized");
  const continueReading: ContinueReading | null = mostRecentFinalized
    ? {
        id: mostRecentFinalized.id,
        title: mostRecentFinalized.brief.theme || "Untitled story",
        cast: castLabel(ctx, mostRecentFinalized, member.id),
        resumeHref: resumeHref(mostRecentFinalized.id),
      }
    : null;

  return (
    <div className="v2-stack">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
        <div>
          <p className="v2-page-eyebrow">📚 {baby.displayName}&apos;s shelf</p>
          <h1 className="v2-page-title">Stories</h1>
          <p style={{ margin: "6px 0 0", color: "#6E6076" }}>
            {books.length} storybook{books.length === 1 ? "" : "s"}
            {readyCast > 0 && ` · ${readyCast} of ${baby.displayName}'s cast ready to star`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/storybooks/classics" className="v2-btn v2-btn--outline" style={{ padding: "12px 18px", fontSize: "0.95rem" }}>
            📖 Classics
          </Link>
          <Link href="/storybooks/new" className="v2-btn-accent">
            ✨ New Story
          </Link>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="v2-card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ fontSize: "2rem", margin: "0 0 1rem" }}>📚</p>
          <h2 style={{ fontFamily: "var(--v2-font-display)" }}>No stories yet</h2>
          <p style={{ color: "#6E6076" }}>Start a new story starring {baby.displayName}.</p>
          <Link href="/storybooks/new" className="v2-btn-accent" style={{ marginTop: 16, display: "inline-flex" }}>
            ✨ New Story
          </Link>
        </div>
      ) : (
        <StoriesShelf books={shelfBooks} continueReading={continueReading} />
      )}
    </div>
  );
}
