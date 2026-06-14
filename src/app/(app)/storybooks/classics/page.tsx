import Link from "next/link";
import type { Metadata } from "next";
import { CuratedClassicCatalog } from "@/adapters/classic-catalog";
import { requireAuthedContext } from "@/lib/auth";
import { bookSky } from "@/components/v2/tokens";

export const metadata: Metadata = { title: "Personalized Classics" };

export default async function ClassicsPage() {
  await requireAuthedContext();
  const classics = new CuratedClassicCatalog().listAvailable();

  return (
    <div className="v2-stack" style={{ gap: 22 }}>
      <div>
        <p className="v2-eyebrow">📚 Personalized Classics</p>
        <h1 className="v2-page-title">Tales your family already loves</h1>
        <p className="v2-page-lead" style={{ maxWidth: 580 }}>
          Every tale here is confirmed public domain. We keep the story&apos;s
          beloved plot beats and recast the heroes as your own family.
        </p>
      </div>

      <div className="v2-card-grid">
        {classics.map((tale, i) => (
          <Link
            key={tale.id}
            href={`/storybooks/classics/${tale.id}`}
            className="v2-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                aspectRatio: "4 / 5",
                borderRadius: 18,
                background: bookSky(i),
                boxShadow: "0 12px 28px rgba(58,40,80,0.16)",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                alignItems: "flex-end",
                padding: 16,
              }}
              aria-hidden="true"
            >
              <span
                style={{
                  position: "absolute",
                  top: 14,
                  right: 16,
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "rgba(255,246,221,0.95)",
                  boxShadow: "0 0 20px rgba(255,240,200,0.5)",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "55%",
                  background: "linear-gradient(to top,rgba(20,14,40,0.78),transparent)",
                }}
              />
              <span
                style={{
                  position: "relative",
                  fontFamily: "var(--v2-font-display)",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  color: "#FAF4E6",
                  lineHeight: 1.15,
                }}
              >
                {tale.title}
              </span>
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--v2-font-display)",
                  fontWeight: 700,
                  fontSize: "1.15rem",
                  color: "#2E2438",
                }}
              >
                {tale.title}
              </h3>
              <p style={{ margin: "2px 0 0", color: "#9A8A78", fontSize: "0.82rem", fontWeight: 700 }}>
                {tale.author}, {tale.firstPublished}
              </p>
            </div>
            <p style={{ margin: 0, color: "#6E6076", fontSize: "0.9rem", lineHeight: 1.45 }}>
              {tale.plotBeats[0]}…
            </p>
            <span
              style={{
                marginTop: "auto",
                color: "#6A55C9",
                fontWeight: 800,
                fontSize: "0.9rem",
              }}
            >
              Recast with your family →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
