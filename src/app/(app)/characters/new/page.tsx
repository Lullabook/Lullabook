import type { Metadata } from "next";
import Link from "next/link";
import { requireAuthedContext } from "@/lib/auth";
import { castSlotInfo } from "@/lib/cast-limits";
import { QuestionnaireForm } from "@/components/questionnaire-form";

export const metadata: Metadata = { title: "New Character" };

export default async function NewCharacterPage() {
  const { ctx, member } = await requireAuthedContext();
  const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);

  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 1100 }}>
      <div>
        <p className="v2-eyebrow">🐻 Invent a character</p>
        <h1 className="v2-page-title">Invent a made-up friend</h1>
        <p className="v2-page-lead" style={{ maxWidth: 520 }}>
          Describe an imaginary character for stories — a dragon, a stuffed-animal
          friend, anyone your child imagines. No photos, no subscription.
        </p>
      </div>
      {!slots.canAdd ? (
        <div className="v2-notice">
          All {slots.limit} free cast slots are full.{" "}
          <Link href="/billing">Upgrade</Link> to add more.
        </div>
      ) : (
        <div className="v2-card v2-form">
          <QuestionnaireForm />
        </div>
      )}
    </div>
  );
}
