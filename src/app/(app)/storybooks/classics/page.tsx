import Link from "next/link";
import type { Metadata } from "next";
import { CuratedClassicCatalog } from "@/adapters/classic-catalog";
import { requireAuthedContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Personalized Classics" };

export default async function ClassicsPage() {
  await requireAuthedContext();
  const classics = new CuratedClassicCatalog().listAvailable();

  return (
    <>
      <p className="eyebrow">Personalized Classics</p>
      <h1>Tales your family already loves — now starring your family</h1>
      <p className="muted" style={{ maxWidth: 560 }}>
        Every tale here is confirmed public domain. We keep the story&apos;s
        beloved plot beats and recast the heroes with your personas.
      </p>
      <div className="card-grid cols-3" style={{ marginTop: "1.5rem" }}>
        {classics.map((tale) => (
          <Link
            key={tale.id}
            className="card"
            style={{ display: "block" }}
            href={`/storybooks/classics/${tale.id}`}
          >
            <h3>{tale.title}</h3>
            <p className="subtle">
              {tale.author}, {tale.firstPublished}
            </p>
            <p className="muted" style={{ fontSize: "0.9rem", marginBottom: 0 }}>
              {tale.plotBeats[0]}…
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
