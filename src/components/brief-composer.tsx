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

  return (
    <form action={submit} className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <fieldset>
        <legend>Starring</legend>
        {personas.length === 0 ? (
          <p className="subtle">
            No personas yet — create one first, or start with a free text
            Character story instead.
          </p>
        ) : (
          <div className="chips">
            {ready.map((p) => (
              <label key={p.id} className="chip">
                <input
                  type="checkbox"
                  checked={starring.includes(p.id)}
                  onChange={() => togglePersona(p.id)}
                />
                {p.displayName}
              </label>
            ))}
            {training.map((p) => (
              <label key={p.id} className="chip">
                <input
                  type="checkbox"
                  checked={starring.includes(p.id)}
                  onChange={() => togglePersona(p.id)}
                />
                {p.displayName} <span className="subtle">(training…)</span>
              </label>
            ))}
          </div>
        )}
        {training.some((t) => starring.includes(t.id)) && (
          <p className="hint" style={{ marginTop: 8 }}>
            This persona is still training (~5 minutes). We&apos;ll start the
            book automatically the moment it&apos;s ready.
          </p>
        )}
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
            🌙 Bedtime — gentle and sleepy
          </label>
          <label className="chip">
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
        <div className="alert alert-info">
          Recasting <strong>{classic.title}</strong> with your family. Add an
          optional twist below.
        </div>
      ) : (
        <div className="field">
          <label htmlFor="theme">Theme</label>
          <input
            id="theme"
            name="theme"
            type="text"
            placeholder="A trip to the moon, learning to share, the first snow…"
            required
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="setting">Setting or occasion (optional)</label>
        <input
          id="setting"
          name="setting"
          type="text"
          placeholder="Grandma's garden, a rainy Sunday, baby's first birthday…"
        />
      </div>

      <div className="field">
        <label htmlFor="note">{classic ? "Twist (optional)" : "Note (optional)"}</label>
        <textarea
          id="note"
          name="note"
          placeholder={
            classic
              ? "What if the rabbit hole led to the bath instead?"
              : "Anything the story should include — a lovey, a song, a phrase…"
          }
        />
        <span className="hint">Notes are moderated before generation.</span>
      </div>

      <fieldset>
        <legend>Art style</legend>
        <div className="chips">
          {ART_STYLES.map((style) => (
            <label key={style} className="chip">
              <input
                type="radio"
                name="artStyle"
                checked={artStyle === style}
                onChange={() => setArtStyle(style)}
              />
              {style}
            </label>
          ))}
          <label className="chip">
            <input
              type="radio"
              name="artStyle"
              checked={artStyle === null}
              onChange={() => setArtStyle(null)}
            />
            Let Lullabook choose
          </label>
        </div>
        <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <label htmlFor="customStyle">Custom style note (optional)</label>
          <input
            id="customStyle"
            name="customStyle"
            type="text"
            placeholder="Like our nursery wallpaper: stars and sage green"
          />
        </div>
      </fieldset>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Tucking the story in…" : "Generate Storybook"}
      </button>
    </form>
  );
}
