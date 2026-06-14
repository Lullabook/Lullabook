import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { castSlotInfo } from "@/lib/cast-limits";
import { PersonaForm } from "@/components/persona-form";

export const metadata: Metadata = { title: "Add a family member" };

export default async function NewPersonaPage() {
  const { ctx, member } = await requireAuthedContext();
  const subscribed = ctx.subscriptions.isActive(member.familyId);
  const babyGate = ctx.subscriptions.canCreateBabyPersona(member.id);
  const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);

  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 640 }}>
      <div>
        <p className="v2-eyebrow">💛 Add to the family</p>
        <h1 className="v2-page-title">
          {subscribed ? "Add a new family member" : "Illustrated members need a plan"}
        </h1>
        <p className="v2-page-lead" style={{ maxWidth: 540 }}>
          {subscribed
            ? "Add someone who loves your little one. We train a private likeness model from their photos so illustrations actually look like them."
            : "On free, describe characters with a questionnaire — no photos. Upgrade for real family photos and illustrated likeness."}
        </p>
      </div>
      {!subscribed && (
        <div className="v2-notice">
          {slots.canAdd ? (
            <>
              <Link href="/characters/new" style={{ color: "#6A55C9", fontWeight: 700 }}>
                Add a character
              </Link>{" "}
              ({slots.remaining} of {slots.limit} slots left) — or{" "}
              <Link href="/billing">upgrade for photos</Link>.
            </>
          ) : (
            <>
              All {slots.limit} free cast slots are full.{" "}
              <Link href="/billing">Upgrade</Link> for illustrated family members.
            </>
          )}
        </div>
      )}
      {subscribed && !slots.canAdd && (
        <div className="v2-notice">
          Cast limit reached for your plan. <Link href="/billing">See plans</Link>.
        </div>
      )}
      {subscribed && slots.canAdd && (
        <div className="v2-card v2-form">
          <PersonaForm
            isGuardian={member.role === "guardian"}
            canCreateBaby={babyGate.allowed}
            babyBlockedReason={babyGate.reason}
          />
        </div>
      )}
    </div>
  );
}
