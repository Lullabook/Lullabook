"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";
import { createPersonaAction, promoteCharacterAction } from "@/lib/actions";

interface PersonaFormProps {
  /** When set, this form promotes an existing Character instead. */
  characterId?: string;
  characterName?: string;
  isGuardian: boolean;
  canCreateBaby: boolean;
  babyBlockedReason?: string;
}

export function PersonaForm({
  characterId,
  characterName,
  isGuardian,
  canCreateBaby,
  babyBlockedReason,
}: PersonaFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"adult" | "baby">("adult");
  const [consented, setConsented] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    if (!consented) {
      setError("Please confirm the consent statement first.");
      return;
    }
    formData.set("mode", mode);
    if (characterId) formData.set("characterId", characterId);
    startTransition(async () => {
      const res: ActionResult = characterId
        ? await promoteCharacterAction(formData)
        : await createPersonaAction(formData);
      if (!res.ok) return setError(res.error);
      router.push("/personas?training=1");
    });
  }

  return (
    <form action={submit} className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!characterId && (
        <fieldset>
          <legend>Who is this persona?</legend>
          <div className="chips" role="radiogroup" aria-label="Persona kind">
            <label className="chip">
              <input
                type="radio"
                name="kindChoice"
                checked={mode === "adult"}
                onChange={() => setMode("adult")}
              />
              🧑 Me (an adult)
            </label>
            <label className="chip">
              <input
                type="radio"
                name="kindChoice"
                checked={mode === "baby"}
                onChange={() => setMode("baby")}
              />
              👶 My baby
            </label>
          </div>
          {mode === "baby" && !isGuardian && (
            <p className="hint" style={{ marginTop: 8 }}>
              Only the Family&apos;s Guardian can create a baby persona.
            </p>
          )}
          {mode === "baby" && isGuardian && !canCreateBaby && (
            <div className="alert alert-warning" style={{ marginTop: 12 }}>
              {babyBlockedReason ??
                "Baby personas need an active subscription — the card payment doubles as verifiable parental consent."}
            </div>
          )}
        </fieldset>
      )}

      {characterId ? (
        <div className="alert alert-info">
          Upgrading <strong>{characterName}</strong> to an illustrated Persona.
          Their traits carry forward; now we just need photos.
        </div>
      ) : (
        <div className="field">
          <label htmlFor="displayName">Name</label>
          <input id="displayName" name="displayName" type="text" required />
        </div>
      )}
      {characterId && (
        <input type="hidden" name="displayName" value={characterName ?? ""} />
      )}

      <div className="field">
        <label htmlFor="photos">Photos (at least 3)</label>
        <input id="photos" name="photos" type="file" accept="image/*" multiple required />
        <span className="hint">
          Clear, well-lit photos of one person. We check each photo before
          training and delete originals on hard-delete.
        </span>
      </div>

      {(mode === "adult" || characterId) && (
        <div className="field">
          <label htmlFor="selfie">A selfie taken now</label>
          <input id="selfie" name="selfie" type="file" accept="image/*" capture="user" />
          <span className="hint">
            Adult personas are your own likeness only — the selfie must match
            the photos.
          </span>
        </div>
      )}

      <div className="alert alert-info">
        <label className="row" style={{ alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            style={{ marginTop: 4, width: "auto" }}
          />
          <span>
            {mode === "baby" && !characterId
              ? "I am this child's Guardian. I consent to training a private likeness model from these photos. My active subscription's card payment verifies this consent."
              : "These photos are of me. I consent to training a private likeness model of myself."}
          </span>
        </label>
      </div>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={pending || (mode === "baby" && (!isGuardian || !canCreateBaby))}
      >
        {pending ? "Uploading…" : "Start training (~5 minutes)"}
      </button>
    </form>
  );
}
