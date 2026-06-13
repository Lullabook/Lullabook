"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TraitQuestionnaire } from "@/domain/types";
import { createCharacterAction } from "@/lib/actions";

const ATTESTATION_TEXT =
  "I am this child's parent or guardian, or I have their guardian's permission to describe them in stories.";

function splitList(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function QuestionnaireForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isFictional, setIsFictional] = useState(true);
  const [attested, setAttested] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    const questionnaire: TraitQuestionnaire = {
      name: String(formData.get("name") ?? "").trim(),
      nickname: String(formData.get("nickname") ?? "").trim() || undefined,
      relationships: splitList(String(formData.get("relationships") ?? "")),
      favoriteAnimals: splitList(String(formData.get("favoriteAnimals") ?? "")),
      favoriteToys: splitList(String(formData.get("favoriteToys") ?? "")),
      songs: splitList(String(formData.get("songs") ?? "")),
      topics: splitList(String(formData.get("topics") ?? "")),
      isFictional,
    };
    if (!questionnaire.name) {
      setError("Every character needs a name.");
      return;
    }
    if (!isFictional && !attested) {
      setError("Please confirm the consent statement for a real child.");
      return;
    }
    startTransition(async () => {
      const res = await createCharacterAction(
        questionnaire,
        !isFictional && attested ? ATTESTATION_TEXT : undefined
      );
      if (!res.ok) return setError(res.error);
      router.push("/characters");
    });
  }

  return (
    <form action={submit} className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <fieldset>
        <legend>Who is this character?</legend>
        <div className="chips" role="radiogroup" aria-label="Character kind">
          <label className="chip">
            <input
              type="radio"
              name="kind"
              checked={isFictional}
              onChange={() => setIsFictional(true)}
            />
            🐉 Made up — a fictional friend
          </label>
          <label className="chip">
            <input
              type="radio"
              name="kind"
              checked={!isFictional}
              onChange={() => setIsFictional(false)}
            />
            👶 A real child in our lives
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required placeholder="Mia" />
      </div>
      <div className="field">
        <label htmlFor="nickname">Nickname (optional)</label>
        <input id="nickname" name="nickname" type="text" placeholder="Mimi" />
      </div>
      <div className="field">
        <label htmlFor="relationships">Important people (optional)</label>
        <input
          id="relationships"
          name="relationships"
          type="text"
          placeholder="Mama, Papa, big brother Theo"
        />
        <span className="hint">Separate with commas.</span>
      </div>
      <div className="field">
        <label htmlFor="favoriteAnimals">Favorite animals (optional)</label>
        <input id="favoriteAnimals" name="favoriteAnimals" type="text" placeholder="bunnies, whales" />
      </div>
      <div className="field">
        <label htmlFor="favoriteToys">Favorite toys (optional)</label>
        <input id="favoriteToys" name="favoriteToys" type="text" placeholder="a wooden train, Blankie" />
      </div>
      <div className="field">
        <label htmlFor="songs">Songs they love (optional)</label>
        <input id="songs" name="songs" type="text" placeholder="Twinkle Twinkle" />
      </div>
      <div className="field">
        <label htmlFor="topics">Things they&apos;re into right now (optional)</label>
        <input id="topics" name="topics" type="text" placeholder="the moon, puddles, dinosaurs" />
      </div>

      {!isFictional && (
        <div className="alert alert-info">
          <label className="row" style={{ alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              style={{ marginTop: 4, width: "auto" }}
            />
            <span>{ATTESTATION_TEXT}</span>
          </label>
        </div>
      )}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create character"}
      </button>
    </form>
  );
}
