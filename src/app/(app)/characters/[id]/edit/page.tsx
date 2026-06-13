import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuthedContext } from "@/lib/auth";
import { QuestionnaireForm } from "@/components/questionnaire-form";

export const metadata: Metadata = { title: "Edit Character" };

export default async function EditCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, member } = await requireAuthedContext();
  const character = ctx.store.getCharacter(id, member.id);
  if (!character) notFound();

  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 640 }}>
      <div>
        <p className="v2-eyebrow">🐻 Edit character</p>
        <h1 className="v2-page-title">Edit {character.displayName}</h1>
        <p className="v2-page-lead" style={{ maxWidth: 520 }}>
          Update the details — the story description is rewritten from the new
          traits when you save.
        </p>
      </div>
      <div className="v2-card v2-form">
        <QuestionnaireForm characterId={character.id} initial={character.questionnaire} />
      </div>
    </div>
  );
}
