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
    <div className="v2-stack" style={{ gap: 18, maxWidth: 640 }}>
      <div>
        <p className="v2-eyebrow">✨ Character → Persona</p>
        <h1 className="v2-page-title">Bring {character.displayName} to life</h1>
        <p className="v2-page-lead" style={{ maxWidth: 540 }}>
          Everything you wrote about {character.displayName} carries forward.
          Adding photos trains a private likeness model so they can star in
          illustrated storybooks.
        </p>
      </div>
      <div className="v2-card v2-form">
        <PersonaForm
          characterId={character.id}
          characterName={character.displayName}
          isGuardian={member.role === "guardian"}
          canCreateBaby={babyGate.allowed}
          babyBlockedReason={babyGate.reason}
        />
      </div>
    </div>
  );
}
