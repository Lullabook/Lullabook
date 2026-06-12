import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Stories" };

export default async function StoriesPage() {
  const { ctx, member } = await requireAuthedContext();
  const stories = [...ctx.store.textStories.values()]
    .filter((s) => s.familyId === member.familyId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <>
      <div className="row between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow">Free text stories</p>
          <h1 style={{ margin: 0 }}>Stories</h1>
        </div>
        <Link className="btn btn-primary btn-sm" href="/stories/new">
          New story
        </Link>
      </div>

      {stories.length === 0 ? (
        <div className="card empty-state">
          <span className="moon" aria-hidden="true">
            📖
          </span>
          <h2>Tonight&apos;s story isn&apos;t written yet</h2>
          <p className="muted" style={{ maxWidth: 460, margin: "0 auto 1.5rem" }}>
            Create a <Link href="/characters/new">character</Link> — no photos,
            no subscription — and we&apos;ll write a story starring them in
            seconds.
          </p>
          <Link className="btn btn-primary" href="/stories/new">
            Write a story
          </Link>
        </div>
      ) : (
        <div className="card-grid">
          {stories.map((s) => (
            <Link key={s.id} className="card" style={{ display: "block" }} href={`/stories/${s.id}`}>
              <h3>{s.brief.theme}</h3>
              <p className="subtle" style={{ marginBottom: 0 }}>
                {s.brief.storyType === "bedtime" ? "🌙 Bedtime" : "🌞 Learning"} ·{" "}
                {s.createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
