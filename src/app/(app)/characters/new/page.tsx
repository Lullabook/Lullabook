import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import { QuestionnaireForm } from "@/components/questionnaire-form";

export const metadata: Metadata = { title: "New Character" };

export default async function NewCharacterPage() {
  await requireAuthedContext();
  return (
    <div className="v2-stack" style={{ gap: 18, maxWidth: 640 }}>
      <div>
        <p className="v2-eyebrow">🐻 Invent a character</p>
        <h1 className="v2-page-title">Invent a made-up friend</h1>
        <p className="v2-page-lead" style={{ maxWidth: 520 }}>
          Tell us a little about them — every detail you share becomes a thread
          the story can weave in. No photos, no subscription.
        </p>
      </div>
      <div className="v2-card v2-form">
        <QuestionnaireForm />
      </div>
    </div>
  );
}
