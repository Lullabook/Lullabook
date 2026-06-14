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
    <form action={submit} className="v2-stack" style={{ gap: 16, fontFamily: "var(--v2-font-body)" }}>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <fieldset style={{ border: "1px solid #ECE1CE", borderRadius: 16, padding: 16, margin: 0 }}>
        <legend style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438", padding: "0 8px" }}>Starring</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {characters.map((c) => (
            <label key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, border: "1px solid #ECE1CE", background: starring.includes(c.id) ? "#EDE7FE" : "#FFFDF9", fontFamily: "var(--v2-font-body)", fontSize: "0.9rem", color: "#2E2438" }}>
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

      <fieldset style={{ border: "1px solid #ECE1CE", borderRadius: 16, padding: 16, margin: 0 }}>
        <legend style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438", padding: "0 8px" }}>Story type</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }} role="radiogroup" aria-label="Story type">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, border: "1px solid #ECE1CE", background: storyType === "bedtime" ? "#EDE7FE" : "#FFFDF9", fontFamily: "var(--v2-font-body)", fontSize: "0.9rem" }}>
            <input
              type="radio"
              name="storyType"
              checked={storyType === "bedtime"}
              onChange={() => setStoryType("bedtime")}
            />
            🌙 Bedtime
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, border: "1px solid #ECE1CE", background: storyType === "learning" ? "#EDE7FE" : "#FFFDF9", fontFamily: "var(--v2-font-body)", fontSize: "0.9rem" }}>
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

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="theme" style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438" }}>Theme</label>
        <input
          id="theme"
          name="theme"
          type="text"
          required
          placeholder="Saying goodnight to the moon, sharing toys at the park…"
          style={{ fontFamily: "var(--v2-font-body)", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="note" style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438" }}>Note (optional)</label>
        <textarea id="note" name="note" placeholder="Tonight was bath night — maybe bubbles?" style={{ fontFamily: "var(--v2-font-body)", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px", minHeight: 88 }} />
      </div>

      <button className="v2-btn v2-btn--primary" type="submit" disabled={pending}>
        {pending ? "Writing…" : "Write the story"}
      </button>
    </form>
  );
}
