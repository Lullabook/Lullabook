import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { QuestionnaireForm } from "@/components/questionnaire-form";

export const metadata: Metadata = { title: "New Character" };

export default async function NewCharacterPage() {
  await requireAuthedContext();
  return (
    <>
      <p className="eyebrow">Trait questionnaire</p>
      <h1>Create a character</h1>
      <p className="muted" style={{ maxWidth: 520 }}>
        Tell us a little about them — every detail you share becomes a thread
        the story can weave in.
      </p>
      <div className="card">
        <QuestionnaireForm />
      </div>
    </>
  );
}
