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
    <div className="v2-stack" style={{ gap: 22 }}>
      <div>
        <p className="v2-page-eyebrow">Free — ready in seconds</p>
        <h1 className="v2-page-title">Write tonight&apos;s story</h1>
        <p className="v2-page-lead" style={{ maxWidth: 580 }}>
          Stories star your characters. Describe someone in a minute — no photos needed.
        </p>
      </div>

      {characters.length === 0 ? (
        <div className="v2-empty">
          <span className="v2-empty__icon" aria-hidden="true">
            🧸
          </span>
          <h2 className="v2-section-title">First, a character</h2>
          <p className="v2-page-lead" style={{ marginBottom: 20 }}>
            Stories star your characters. Describe someone in a minute — no photos needed.
          </p>
          <Link className="v2-btn v2-btn--primary" href="/characters/new">
            Create a character
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "#FFFDF9",
            border: "1px solid #ECE1CE",
            borderRadius: 22,
            padding: 22,
            boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
          }}
        >
          <TextStoryForm characters={characters} />
        </div>
      )}
    </div>
  );
}
