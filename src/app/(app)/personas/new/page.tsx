import Link from "next/link";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { PersonaForm } from "@/components/persona-form";

export const metadata: Metadata = { title: "New Persona" };

export default async function NewPersonaPage() {
  const { ctx, member } = await requireAuthedContext();
  const subscribed = ctx.subscriptions.isActive(member.familyId);
  const babyGate = ctx.subscriptions.canCreateBabyPersona(member.id);

  return (
    <>
      <p className="eyebrow">Illustrated tier</p>
      <h1>Create a Persona</h1>
      <p className="muted" style={{ maxWidth: 540 }}>
        A persona is a private likeness model trained from your photos, so
        illustrations actually look like your family. Photos and models stay
        encrypted, are never shared, and vanish completely on hard-delete.
      </p>
      {!subscribed && (
        <div className="alert alert-warning">
          Personas need an active subscription. <Link href="/billing">See plans</Link>.
        </div>
      )}
      <div className="card">
        <PersonaForm
          isGuardian={member.role === "guardian"}
          canCreateBaby={babyGate.allowed}
          babyBlockedReason={babyGate.reason}
        />
      </div>
    </>
  );
}
