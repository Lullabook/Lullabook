import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CuratedClassicCatalog } from "@/adapters/classic-catalog";
import { requireAuthedContext } from "@/lib/auth";
import { BriefComposer } from "@/components/brief-composer";

export const metadata: Metadata = { title: "Personalize a Classic" };

export default async function ClassicBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tale = new CuratedClassicCatalog().getById(id);
  if (!tale) notFound();

  const { ctx, member } = await requireAuthedContext();
  const personas = ctx.roster.listForCurrentFamily(member.id).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    status: p.status,
  }));

  return (
    <>
      <p className="eyebrow">Personalized Classic</p>
      <h1>{tale.title}</h1>
      <div className="card">
        <BriefComposer
          personas={personas}
          classic={{ id: tale.id, title: tale.title }}
        />
      </div>
    </>
  );
}
