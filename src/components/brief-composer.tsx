"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Brief, StoryType } from "@/domain/types";
import {
  generateFromClassicAction,
  generateStorybookAction,
  submitBriefWhileTrainingAction,
} from "@/lib/actions";

export interface ComposerPersona {
  id: string;
  displayName: string;
  status: string;
}

const ART_STYLES = [
  "Soft watercolor",
  "Paper-cut collage",
  "Crayon sketchbook",
  "Dreamy gouache",
  "Vintage picture book",
];

interface BriefComposerProps {
  personas: ComposerPersona[];
  classic?: { id: string; title: string };
}

export function BriefComposer({ personas, classic }: BriefComposerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [starring, setStarring] = useState<string[]>([]);
  const [storyType, setStoryType] = useState<StoryType>("bedtime");
  const [artStyle, setArtStyle] = useState<string | null>(null);

  const ready = personas.filter((p) => p.status === "ready");
  const training = personas.filter((p) => p.status === "training");

  function togglePersona(id: string) {
    setStarring((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit(formData: FormData) {
    setError(null);
    const brief: Brief = {
      starringPersonaIds: starring,
      storyType,
      theme: classic ? classic.title : String(formData.get("theme") ?? "").trim(),
      setting: String(formData.get("setting") ?? "").trim() || undefined,
      note: String(formData.get("note") ?? "").trim() || undefined,
      customStyleNote:
        [artStyle, String(formData.get("customStyle") ?? "").trim()]
          .filter(Boolean)
          .join(". ") || undefined,
    };
    if (!classic && !brief.theme) {
      setError("Give your story a theme — what is it about?");
      return;
    }
    if (starring.length === 0) {
      setError("Pick at least one persona to star in the story.");
      return;
    }

    startTransition(async () => {
      const starringTraining = training.some((t) => starring.includes(t.id));
      if (starringTraining && starring.length === 1) {
        // Cold start: the persona finishes training, the book starts itself.
        const res = await submitBriefWhileTrainingAction(starring[0], brief);
        if (!res.ok) return setError(res.error);
        router.push("/library?queued=1");
        return;
      }
      const res = classic
        ? await generateFromClassicAction(classic.id, brief)
        : await generateStorybookAction(brief);
      if (!res.ok) return setError(res.error);
      router.push(`/storybooks/${res.data.storybookId}`);
    });
  }

  const fieldset: React.CSSProperties = { border: "1px solid #ECE1CE", borderRadius: 16, padding: 16, margin: 0 };
  const legend: React.CSSProperties = { fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438", padding: "0 8px" };
  const labelText: React.CSSProperties = { fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438" };
  const inputStyle: React.CSSProperties = { fontFamily: "var(--v2-font-body)", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px", boxSizing: "border-box" };
  const chipStyle = (active: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, border: "1px solid #ECE1CE", background: active ? "#EDE7FE" : "#FFFDF9", fontFamily: "var(--v2-font-body)", fontSize: "0.9rem", color: "#2E2438", cursor: "pointer" });
  const hintStyle: React.CSSProperties = { fontSize: "0.82rem", color: "#9A8A78" };

  return (
    <form action={submit} className="v2-stack" style={{ gap: 16, fontFamily: "var(--v2-font-body)" }}>
      {error && (
        <div role="alert" style={{ borderRadius: 16, padding: "14px 16px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48", fontSize: "0.92rem" }}>
          {error}
        </div>
      )}

      <fieldset style={fieldset}>
        <legend style={legend}>Starring</legend>
        {personas.length === 0 ? (
          <p style={hintStyle}>
            No personas yet — create one first, or start with a free text
            Character story instead.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {ready.map((p) => (
              <label key={p.id} style={chipStyle(starring.includes(p.id))}>
                <input
                  type="checkbox"
                  checked={starring.includes(p.id)}
                  onChange={() => togglePersona(p.id)}
                />
                {p.displayName}
              </label>
            ))}
            {training.map((p) => (
              <label key={p.id} style={chipStyle(starring.includes(p.id))}>
                <input
                  type="checkbox"
                  checked={starring.includes(p.id)}
                  onChange={() => togglePersona(p.id)}
                />
                {p.displayName} <span style={hintStyle}>(training…)</span>
              </label>
            ))}
          </div>
        )}
        {training.some((t) => starring.includes(t.id)) && (
          <p style={{ ...hintStyle, marginTop: 8 }}>
            This persona is still training (~5 minutes). We&apos;ll start the
            book automatically the moment it&apos;s ready.
          </p>
        )}
      </fieldset>

      <fieldset style={fieldset}>
        <legend style={legend}>Story type</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }} role="radiogroup" aria-label="Story type">
          <label style={chipStyle(storyType === "bedtime")}>
            <input
              type="radio"
              name="storyType"
              checked={storyType === "bedtime"}
              onChange={() => setStoryType("bedtime")}
            />
            🌙 Bedtime — gentle and sleepy
          </label>
          <label style={chipStyle(storyType === "learning")}>
            <input
              type="radio"
              name="storyType"
              checked={storyType === "learning"}
              onChange={() => setStoryType("learning")}
            />
            🌞 Learning — a little lesson
          </label>
        </div>
      </fieldset>

      {classic ? (
        <div style={{ borderRadius: 16, padding: "14px 16px", background: "#EDE7FE", border: "1px solid #D7CBEE", color: "#4A3D6B", fontSize: "0.92rem" }}>
          Recasting <strong>{classic.title}</strong> with your family. Add an
          optional twist below.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="theme" style={labelText}>Theme</label>
          <input
            id="theme"
            name="theme"
            type="text"
            placeholder="A trip to the moon, learning to share, the first snow…"
            required
            style={inputStyle}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="setting" style={labelText}>Setting or occasion (optional)</label>
        <input
          id="setting"
          name="setting"
          type="text"
          placeholder="Grandma's garden, a rainy Sunday, baby's first birthday…"
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="note" style={labelText}>{classic ? "Twist (optional)" : "Note (optional)"}</label>
        <textarea
          id="note"
          name="note"
          placeholder={
            classic
              ? "What if the rabbit hole led to the bath instead?"
              : "Anything the story should include — a lovey, a song, a phrase…"
          }
          style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
        />
        <span style={hintStyle}>Notes are moderated before generation.</span>
      </div>

      <fieldset style={fieldset}>
        <legend style={legend}>Art style</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {ART_STYLES.map((style) => (
            <label key={style} style={chipStyle(artStyle === style)}>
              <input
                type="radio"
                name="artStyle"
                checked={artStyle === style}
                onChange={() => setArtStyle(style)}
              />
              {style}
            </label>
          ))}
          <label style={chipStyle(artStyle === null)}>
            <input
              type="radio"
              name="artStyle"
              checked={artStyle === null}
              onChange={() => setArtStyle(null)}
            />
            Let Lullabook choose
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          <label htmlFor="customStyle" style={labelText}>Custom style note (optional)</label>
          <input
            id="customStyle"
            name="customStyle"
            type="text"
            placeholder="Like our nursery wallpaper: stars and sage green"
            style={inputStyle}
          />
        </div>
      </fieldset>

      <button className="v2-btn v2-btn--primary" type="submit" disabled={pending}>
        {pending ? "Tucking the story in…" : "✨ Generate Storybook"}
      </button>
    </form>
  );
}
