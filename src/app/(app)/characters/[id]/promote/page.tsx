import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { PersonaForm } from "@/components/persona-form";

export const metadata: Metadata = { title: "Upgrade to Persona" };

export default async function PromoteCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, member } = await requireAuthedContext();

  let character;
  try {
    character = ctx.store.getCharacter(id, member.id);
  } catch {
    notFound();
  }
  if (!character || character.promotedPersonaId) notFound();

  const babyGate = ctx.subscriptions.canCreateBabyPersona(member.id);

  return (
    <>
      <p className="eyebrow">Character → Persona</p>
      <h1>Bring {character.displayName} to life</h1>
      <p className="muted" style={{ maxWidth: 540 }}>
        Everything you wrote about {character.displayName} carries forward.
        Adding photos trains a private likeness model so they can star in
        illustrated storybooks.
      </p>
      <div className="card">
        <PersonaForm
          characterId={character.id}
          characterName={character.displayName}
          isGuardian={member.role === "guardian"}
          canCreateBaby={babyGate.allowed}
          babyBlockedReason={babyGate.reason}
        />
      </div>
    </>
  );
}
