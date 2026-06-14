import Link from "next/link";
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
    <div className="v2-stack" style={{ gap: 18, maxWidth: 720 }}>
      <div>
        <Link href="/storybooks/classics" className="v2-link-action">
          ‹ Back to Classics
        </Link>
        <p className="v2-eyebrow" style={{ marginTop: 10 }}>
          📚 Personalized Classic
        </p>
        <h1 className="v2-page-title">{tale.title}</h1>
        <p className="v2-page-lead" style={{ maxWidth: 560 }}>
          We&apos;ll keep this tale&apos;s beloved plot and recast its heroes as
          your own family. Add an optional twist below.
        </p>
      </div>
      <div className="v2-card v2-form">
        <BriefComposer
          personas={personas}
          classic={{ id: tale.id, title: tale.title }}
        />
      </div>
    </div>
  );
}
