import { redirect } from "next/navigation";
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

  if (!subscribed) {
    redirect(slots.canAdd ? "/characters/new" : "/billing");
  }

  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 1100 }}>
      <div>
        <p className="v2-eyebrow">💛 Add to the family</p>
        <h1 className="v2-page-title">Add a new family member</h1>
        <p className="v2-page-lead" style={{ maxWidth: 540 }}>
          Add someone who loves your little one. We train a private likeness model from their photos so illustrations actually look like them.
        </p>
      </div>
      {!slots.canAdd && (
        <div className="v2-notice">
          Cast limit reached for your plan. <Link href="/billing">See plans</Link>.
        </div>
      )}
      {slots.canAdd && (
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
