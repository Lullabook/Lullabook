import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { AVATAR_GRADIENTS, characterEmoji } from "@/lib/v2-theme";

export const metadata: Metadata = { title: "Characters" };

export default async function CharactersPage() {
  const { ctx, member } = await requireAuthedContext();
  const baby = ctx.babies.ensureDefaultBaby(member.id);
  const characters = ctx.store.getCharactersByFamily(member.familyId, member.id);

  return (
    <div className="v2-stack" style={{ gap: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p className="v2-eyebrow">🐻 Made-up friends</p>
          <h1 className="v2-page-title">Characters</h1>
          <p className="v2-page-lead" style={{ maxWidth: 560 }}>
            Imaginary friends you invent for {baby.displayName}&apos;s world — a
            brave little dragon, a sleepy moon, a cat who talks. Free to create from
            a few traits.
          </p>
        </div>
        <Link className="v2-btn v2-btn--outline" href="/characters/new">
          ＋ Invent a character
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="v2-empty">
          <span className="v2-empty__icon" aria-hidden="true">
            🧸
          </span>
          <h2 className="v2-section-title">Describe someone your little one loves</h2>
          <p className="v2-page-lead" style={{ marginBottom: 20 }}>
            A character is just a description — a name, favorite animals, a beloved
            song. No photos, no subscription. Stories start here.
          </p>
          <Link className="v2-btn v2-btn--primary" href="/characters/new">
            Create your first character
          </Link>
        </div>
      ) : (
        <div className="v2-card-grid">
          {characters.map((c, i) => {
            const q = c.questionnaire;
            const tags = [
              ...(q.favoriteAnimals ?? []).slice(0, 1),
              ...(q.topics ?? []).slice(0, 1),
            ].filter(Boolean);
            const trait =
              q.nickname ||
              (q.favoriteToys?.length ? `Loves ${q.favoriteToys[0]}` : null) ||
              (q.isFictional ? "A made-up friend in their world" : "Someone they love");

            return (
              <div key={c.id} className="v2-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 20,
                      background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.7rem",
                    }}
                    aria-hidden="true"
                  >
                    {characterEmoji(c.displayName)}
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: "var(--v2-font-display)",
                        fontWeight: 700,
                        fontSize: "1.2rem",
                      }}
                    >
                      {c.displayName}
                    </h3>
                    <span style={{ color: "#9A8A78", fontSize: "0.82rem", fontWeight: 700 }}>
                      {q.isFictional ? "Made-up friend" : "Real child"}
                      {c.promotedPersonaId && " · upgraded to Persona"}
                    </span>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: "#6E6076",
                    fontSize: "0.9rem",
                    lineHeight: 1.4,
                    minHeight: 38,
                  }}
                >
                  {trait}
                </p>
                {tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          padding: "4px 11px",
                          borderRadius: 999,
                          background: "#EDE7FE",
                          color: "#6A55C9",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ height: 1, background: "#F0E6D2" }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    className="v2-btn v2-btn--ghost-surface"
                    href="/stories/new"
                    style={{ flex: 1, justifyContent: "center", padding: 10, fontSize: "0.88rem" }}
                  >
                    Write a story
                  </Link>
                  {!c.promotedPersonaId && (
                    <Link
                      className="v2-btn v2-btn--outline"
                      href={`/characters/${c.id}/promote`}
                      style={{ flex: 1, justifyContent: "center", padding: 10, fontSize: "0.88rem" }}
                    >
                      Upgrade →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          <Link
            href="/characters/new"
            style={{
              border: "2px dashed #D8C9B0",
              borderRadius: 22,
              background: "#FFF8EC",
              minHeight: 230,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: "#9A8A78",
              fontWeight: 800,
              fontSize: "0.98rem",
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: 54,
                height: 54,
                borderRadius: "50%",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                boxShadow: "0 6px 16px rgba(58,40,80,0.1)",
              }}
              aria-hidden="true"
            >
              ＋
            </span>
            Invent a new
            <br />
            made-up friend
          </Link>
        </div>
      )}
    </div>
  );
}
