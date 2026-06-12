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
    <>
      <p className="eyebrow">
        {story.brief.storyType === "bedtime" ? "🌙 A bedtime story" : "🌞 A learning story"}
      </p>
      <h1>{story.brief.theme}</h1>
      <article className="card">
        <div className="prose">{story.text}</div>
      </article>
      <div className="row" style={{ marginTop: "1.5rem" }}>
        <Link className="btn btn-secondary" href="/stories/new">
          Another story
        </Link>
        <Link className="btn btn-ghost" href="/personas/new">
          Want it illustrated? Create a Persona
        </Link>
      </div>
    </>
  );
}
