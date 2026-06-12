import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Characters" };

export default async function CharactersPage() {
  const { ctx, member } = await requireAuthedContext();
  const characters = ctx.store.getCharactersByFamily(member.familyId, member.id);

  return (
    <>
      <div className="row between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow">Free tier — no photos needed</p>
          <h1 style={{ margin: 0 }}>Characters</h1>
        </div>
        <Link className="btn btn-primary btn-sm" href="/characters/new">
          New character
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="card empty-state">
          <span className="moon" aria-hidden="true">
            🧸
          </span>
          <h2>Describe someone your little one loves</h2>
          <p className="muted">
            A character is just a description — a name, favorite animals, a
            beloved song. No photos, no subscription. Stories start here.
          </p>
          <Link className="btn btn-primary" href="/characters/new">
            Create your first character
          </Link>
        </div>
      ) : (
        <div className="card-grid">
          {characters.map((c) => (
            <div key={c.id} className="card">
              <h3>{c.displayName}</h3>
              <p className="subtle">
                {c.questionnaire.isFictional ? "Fictional friend" : "Real child"}
                {c.promotedPersonaId && " · upgraded to Persona"}
              </p>
              <div className="row">
                <Link className="btn btn-secondary btn-sm" href="/stories/new">
                  Write a story
                </Link>
                {!c.promotedPersonaId && (
                  <Link
                    className="btn btn-ghost btn-sm"
                    href={`/characters/${c.id}/promote`}
                  >
                    Upgrade to Persona
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
