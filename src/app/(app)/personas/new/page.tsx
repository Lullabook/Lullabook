import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { PersonaForm } from "@/components/persona-form";

export const metadata: Metadata = { title: "Add a family member" };

export default async function NewPersonaPage() {
  const { ctx, member } = await requireAuthedContext();
  const subscribed = ctx.subscriptions.isActive(member.familyId);
  const babyGate = ctx.subscriptions.canCreateBabyPersona(member.id);

  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 640 }}>
      <div>
        <p className="v2-eyebrow">💛 Add to the family</p>
        <h1 className="v2-page-title">Add a new family member</h1>
        <p className="v2-page-lead" style={{ maxWidth: 540 }}>
          Add someone who loves your little one. We train a private likeness model
          from their photos so illustrations actually look like them. Photos and
          models stay encrypted, are never shared, and vanish completely on
          hard-delete.
        </p>
      </div>
      {!subscribed && (
        <div className="v2-notice">
          Illustrated family members need an active subscription.{" "}
          <Link href="/billing">See plans</Link>.
        </div>
      )}
      <div className="v2-card v2-form">
        <PersonaForm
          isGuardian={member.role === "guardian"}
          canCreateBaby={babyGate.allowed}
          babyBlockedReason={babyGate.reason}
        />
      </div>
    </div>
  );
}
