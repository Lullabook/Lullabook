"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StoryType } from "@/domain/types";
import { createTextStoryAction } from "@/lib/actions";

interface TextStoryFormProps {
  characters: { id: string; displayName: string }[];
}

export function TextStoryForm({ characters }: TextStoryFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [starring, setStarring] = useState<string[]>(
    characters.length === 1 ? [characters[0].id] : []
  );
  const [storyType, setStoryType] = useState<StoryType>("bedtime");

  function toggle(id: string) {
    setStarring((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit(formData: FormData) {
    setError(null);
    const theme = String(formData.get("theme") ?? "").trim();
    if (!theme) return setError("Give the story a theme.");
    if (starring.length === 0) return setError("Pick at least one character.");
    startTransition(async () => {
      const res = await createTextStoryAction({
        starringCharacterIds: starring,
        storyType,
        theme,
        note: String(formData.get("note") ?? "").trim() || undefined,
      });
      if (!res.ok) return setError(res.error);
      router.push(`/stories/${res.data.storyId}`);
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
        <legend>Starring</legend>
        <div className="chips">
          {characters.map((c) => (
            <label key={c.id} className="chip">
              <input
                type="checkbox"
                checked={starring.includes(c.id)}
                onChange={() => toggle(c.id)}
              />
              {c.displayName}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Story type</legend>
        <div className="chips" role="radiogroup" aria-label="Story type">
          <label className="chip">
            <input
              type="radio"
              name="storyType"
              checked={storyType === "bedtime"}
              onChange={() => setStoryType("bedtime")}
            />
            🌙 Bedtime
          </label>
          <label className="chip">
            <input
              type="radio"
              name="storyType"
              checked={storyType === "learning"}
              onChange={() => setStoryType("learning")}
            />
            🌞 Learning
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="theme">Theme</label>
        <input
          id="theme"
          name="theme"
          type="text"
          required
          placeholder="Saying goodnight to the moon, sharing toys at the park…"
        />
      </div>
      <div className="field">
        <label htmlFor="note">Note (optional)</label>
        <textarea id="note" name="note" placeholder="Tonight was bath night — maybe bubbles?" />
      </div>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Writing…" : "Write the story"}
      </button>
    </form>
  );
}
