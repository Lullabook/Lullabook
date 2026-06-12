import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { TextStoryForm } from "@/components/text-story-form";

export const metadata: Metadata = { title: "New Story" };

export default async function NewStoryPage() {
  const { ctx, member } = await requireAuthedContext();
  const characters = ctx.store
    .getCharactersByFamily(member.familyId, member.id)
    .map((c) => ({ id: c.id, displayName: c.displayName }));

  return (
    <>
      <p className="eyebrow">Free — ready in seconds</p>
      <h1>Write tonight&apos;s story</h1>

      {characters.length === 0 ? (
        <div className="card empty-state">
          <span className="moon" aria-hidden="true">
            🧸
          </span>
          <h2>First, a character</h2>
          <p className="muted">
            Stories star your characters. Describe someone in a minute — no
            photos needed.
          </p>
          <Link className="btn btn-primary" href="/characters/new">
            Create a character
          </Link>
        </div>
      ) : (
        <div className="card">
          <TextStoryForm characters={characters} />
        </div>
      )}
    </>
  );
}
