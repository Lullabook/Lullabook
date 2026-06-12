import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { BriefComposer } from "@/components/brief-composer";

export const metadata: Metadata = { title: "New Storybook" };

export default async function NewStorybookPage() {
  const { ctx, member } = await requireAuthedContext();
  const subscribed = ctx.subscriptions.isActive(member.familyId);
  const personas = ctx.roster.listForCurrentFamily(member.id).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    status: p.status,
  }));

  return (
    <>
      <p className="eyebrow">Compose a Brief</p>
      <h1>New Storybook</h1>

      {!subscribed && (
        <div className="alert alert-warning">
          Illustrated Storybooks need an active subscription.{" "}
          <Link href="/billing">See plans</Link> — or create a{" "}
          <Link href="/stories/new">free text Story</Link> with no photos at
          all.
        </div>
      )}

      <div className="card">
        <BriefComposer personas={personas} />
      </div>

      <p className="subtle" style={{ marginTop: "1.5rem" }}>
        Prefer a familiar tale? Recast your family into a{" "}
        <Link href="/storybooks/classics">Personalized Classic</Link>.
      </p>
    </>
  );
}
