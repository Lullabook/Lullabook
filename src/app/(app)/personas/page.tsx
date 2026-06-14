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
    <div className="v2-stack" style={{ gap: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <p className="v2-eyebrow">💛 Illustrated cast</p>
          <h1 className="v2-page-title">Family roster</h1>
        </div>
        <Link className="v2-btn v2-btn--primary" href="/personas/new">
          ＋ Add family member
        </Link>
      </div>

      {training && (
        <div className="v2-notice">
          Training started — it takes about 5 minutes. We&apos;ll let you know
          when {personas.find((p) => p.status === "training")?.displayName ??
            "your new family member"}{" "}
          is ready. Meanwhile, you can already{" "}
          <Link href="/storybooks/new">start a story</Link> — it begins itself
          when training finishes.
        </div>
      )}

      {personas.length === 0 ? (
        <div className="v2-empty">
          <span className="v2-empty__icon" aria-hidden="true">
            🧸
          </span>
          <h2 className="v2-section-title">No family members yet</h2>
          <p className="v2-page-lead" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
            Add the people who love your little one — trained privately from your
            own photos. Or start free with a{" "}
            <Link href="/characters/new">text character</Link>, no photos needed.
          </p>
          <Link className="v2-btn v2-btn--primary" href="/personas/new">
            Add your first family member
          </Link>
        </div>
      ) : (
        <div className="v2-card-grid">
          {personas.map((p) => (
            <div key={p.id} className="v2-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h3 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem" }}>
                  {p.displayName}
                </h3>
                <span className={`badge badge-${p.status}`}>{p.status}</span>
              </div>
              <p style={{ margin: 0, color: "#9A8A78", fontSize: "0.85rem", fontWeight: 700 }}>
                {KIND_LABEL[p.kind]}
                {p.promotedFromCharacterId && " · upgraded from a character"}
              </p>
              {p.status === "ready" && (
                <LikenessConfirm personaId={p.id} displayName={p.displayName} />
              )}
              {p.status === "training" && (
                <p style={{ margin: 0, color: "#6E6076", fontSize: "0.9rem" }}>
                  Training — about 5 minutes. We&apos;ll let you know.
                </p>
              )}
              {p.status === "failed" && (
                <p style={{ margin: 0, color: "#6E6076", fontSize: "0.9rem" }}>
                  Training didn&apos;t work out — any charge for this member is
                  refunded. Try again with a few different photos.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
