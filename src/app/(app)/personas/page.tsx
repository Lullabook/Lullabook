import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { LikenessConfirm } from "@/components/likeness-confirm";

export const metadata: Metadata = { title: "Personas" };

const KIND_LABEL = { baby: "Baby", adult: "Adult" } as const;

export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ training?: string }>;
}) {
  const { training } = await searchParams;
  const { ctx, member } = await requireAuthedContext();
  const personas = ctx.roster.listForCurrentFamily(member.id);

  return (
    <>
      <div className="row between" style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Persona roster</h1>
        <Link className="btn btn-primary btn-sm" href="/personas/new">
          New persona
        </Link>
      </div>

      {training && (
        <div className="alert alert-info">
          Training started — it takes about 5 minutes. We&apos;ll email you
          when {personas.find((p) => p.status === "training")?.displayName ??
            "your persona"}{" "}
          is ready. Meanwhile, you can already{" "}
          <Link href="/storybooks/new">compose a Brief</Link> — the book starts
          itself when training finishes.
        </div>
      )}

      {personas.length === 0 ? (
        <div className="card empty-state">
          <span className="moon" aria-hidden="true">
            🧸
          </span>
          <h2>No personas yet</h2>
          <p className="muted" style={{ maxWidth: 460, margin: "0 auto 1.5rem" }}>
            Personas are the illustrated stars of your storybooks — trained
            privately from your own photos. Or start free with a{" "}
            <Link href="/characters/new">text character</Link>, no photos
            needed.
          </p>
          <Link className="btn btn-primary" href="/personas/new">
            Create your first persona
          </Link>
        </div>
      ) : (
        <div className="card-grid">
          {personas.map((p) => (
            <div key={p.id} className="card">
              <div className="row between">
                <h3 style={{ margin: 0 }}>{p.displayName}</h3>
                <span className={`badge badge-${p.status}`}>{p.status}</span>
              </div>
              <p className="subtle">
                {KIND_LABEL[p.kind]} persona
                {p.promotedFromCharacterId && " · upgraded from a character"}
              </p>
              {p.status === "ready" && (
                <LikenessConfirm personaId={p.id} displayName={p.displayName} />
              )}
              {p.status === "training" && (
                <p className="muted" style={{ fontSize: "0.9rem", marginBottom: 0 }}>
                  Training — about 5 minutes. We&apos;ll let you know.
                </p>
              )}
              {p.status === "failed" && (
                <p className="muted" style={{ fontSize: "0.9rem", marginBottom: 0 }}>
                  Training didn&apos;t work out — any charge for this persona
                  is refunded. Try again with a few different photos.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
