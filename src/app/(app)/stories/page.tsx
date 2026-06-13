import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { V2BookCover } from "@/components/v2/book-card";

export const metadata: Metadata = { title: "Stories" };

export default async function StoriesPage() {
  const { ctx, member } = await requireAuthedContext();
  const baby = ctx.babies.getSelected(member.id) ?? ctx.babies.ensureDefaultBaby(member.id);
  const books = ctx.store
    .listStorybooksForBaby(baby.id, member.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="v2-stack">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
        <div>
          <p className="v2-page-eyebrow">📚 {baby.displayName}&apos;s shelf</p>
          <h1 className="v2-page-title">Stories</h1>
          <p style={{ margin: "6px 0 0", color: "#6E6076" }}>
            {books.length} storybook{books.length === 1 ? "" : "s"} in {baby.displayName}&apos;s world
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/storybooks/classics" className="v2-btn-primary" style={{ padding: "12px 18px", fontSize: "0.95rem" }}>
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
        <div className="v2-book-grid">
          {books.map((book, i) => (
            <V2BookCover key={book.id} book={book} href={`/storybooks/${book.id}/read`} index={i} />
          ))}
          <Link href="/storybooks/new" className="v2-book-cover" style={{ border: "2px dashed #D8C9B0", background: "#FFF8EC", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#9A8A78", fontWeight: 800, textDecoration: "none", aspectRatio: "4/5" }}>
            <span style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", boxShadow: "0 6px 16px rgba(58,40,80,0.1)" }}>＋</span>
            New Story
          </Link>
        </div>
      )}
    </div>
  );
}
