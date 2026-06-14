import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Story" };

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, member } = await requireAuthedContext();

  let story;
  try {
    story = ctx.store.getTextStory(id, member.id);
  } catch {
    notFound();
  }
  if (!story) notFound();

  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 760 }}>
      <div>
        <Link href="/stories" className="v2-link-action">
          ‹ Back to Stories
        </Link>
        <p className="v2-eyebrow" style={{ marginTop: 10 }}>
          {story.brief.storyType === "bedtime" ? "🌙 A bedtime story" : "🌞 A learning story"}
        </p>
        <h1 className="v2-page-title">{story.brief.theme}</h1>
      </div>
      <article
        style={{
          background: "#FFFDF9",
          border: "1px solid #ECE1CE",
          borderRadius: 22,
          padding: "28px 30px",
          boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--v2-font-body)",
            fontSize: "1.12rem",
            lineHeight: 1.9,
            color: "#2E2438",
            whiteSpace: "pre-wrap",
          }}
        >
          {story.text}
        </div>
      </article>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="v2-btn v2-btn--primary" href="/stories/new">
          ＋ Another story
        </Link>
        <Link className="v2-btn v2-btn--ghost-surface" href="/personas/new">
          ✨ Want it illustrated? Add a family member
        </Link>
      </div>
    </div>
  );
}
