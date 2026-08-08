"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { TraitQuestionnaire } from "@/domain/types";
import { createCharacterAction, updateCharacterAction } from "@/lib/actions";
import { characterEmoji } from "@/lib/v2-theme";

function splitList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

const label: CSSProperties = {
  display: "block",
  fontFamily: "var(--v2-font-display)",
  fontWeight: 700,
  fontSize: "1.05rem",
  color: "#2E2438",
  marginBottom: 6,
};
const input: CSSProperties = {
  width: "100%",
  fontSize: "1rem",
  color: "#2E2438",
  background: "#FBF4E7",
  border: "1px solid #ECE1CE",
  borderRadius: 14,
  padding: "13px 15px",
  boxSizing: "border-box",
};
const cardStyle: CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 22,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

/** Client-side echo of the engine blurb, just for the live preview. */
function previewDescription(q: { name: string; traits: string[]; animals: string[]; toys: string[] }): string {
  const name = q.name.trim() || "Your character";
  const parts: string[] = [];
  if (q.traits.length) parts.push(q.traits.slice(0, 3).join(", ").toLowerCase());
  let s = name + (parts.length ? ` is ${parts.join(" and ")}` : " is a brand-new friend");
  if (q.animals.length) s += `, loves ${q.animals.slice(0, 2).join(" and ")}`;
  if (q.toys.length) s += `, never far from ${q.toys[0]}`;
  return s + ".";
}

export function QuestionnaireForm({
  characterId,
  initial,
}: {
  characterId?: string;
  initial?: TraitQuestionnaire;
} = {}) {
  const router = useRouter();
  const isEdit = Boolean(characterId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const csv = (items?: string[]) => (items ?? []).join(", ");
  const [name, setName] = useState(initial?.name ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [relationships, setRelationships] = useState(csv(initial?.relationships));
  const [favoriteAnimals, setFavoriteAnimals] = useState(csv(initial?.favoriteAnimals));
  const [favoriteToys, setFavoriteToys] = useState(csv(initial?.favoriteToys));
  const [songs, setSongs] = useState(csv(initial?.songs));
  const [topics, setTopics] = useState(csv(initial?.topics));

  function submit() {
    setError(null);
    const questionnaire: TraitQuestionnaire = {
      name: name.trim(),
      nickname: nickname.trim() || undefined,
      relationships: splitList(relationships).length ? splitList(relationships) : undefined,
      favoriteAnimals: splitList(favoriteAnimals).length ? splitList(favoriteAnimals) : undefined,
      favoriteToys: splitList(favoriteToys).length ? splitList(favoriteToys) : undefined,
      songs: splitList(songs).length ? splitList(songs) : undefined,
      topics: splitList(topics).length ? splitList(topics) : undefined,
      isFictional: true,
    };
    if (!questionnaire.name) {
      setError("Every character needs a name.");
      document.getElementById("character-form-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    startTransition(async () => {
      const res =
        isEdit && characterId
          ? await updateCharacterAction(characterId, questionnaire)
          : await createCharacterAction(questionnaire);
      if (!res.ok) {
        setError(res.error);
        document.getElementById("character-form-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      router.push("/characters");
    });
  }

  const previewTags = splitList(topics).slice(0, 4);
  const previewName = name.trim() || "Your character";
  const ready = name.trim().length > 0;

  return (
    <div className="v2-character-form">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 22 }}
      >
        {error && (
          <div id="character-form-error" role="alert" style={{ borderRadius: 16, padding: "14px 16px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48" }}>
            {error}
          </div>
        )}

        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <Field id="name" label="Name" value={name} onChange={setName} placeholder="Pip" required />
            <Field id="nickname" label="Nickname" optional value={nickname} onChange={setNickname} placeholder="Pippin" />
          </div>
          <Field id="relationships" label="People they know in stories" hint="comma separated" value={relationships} onChange={setRelationships} placeholder="Maya, Dada, big brother Theo" />
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <Field id="favoriteAnimals" label="Favorite animals" value={favoriteAnimals} onChange={setFavoriteAnimals} placeholder="dragons, fireflies" />
            <Field id="favoriteToys" label="Favorite toys" value={favoriteToys} onChange={setFavoriteToys} placeholder="a tiny lantern" />
          </div>
          <Field id="songs" label="Songs they love" value={songs} onChange={setSongs} placeholder="Twinkle Twinkle" />
          <div>
            <Field id="topics" label="Traits & things they love" value={topics} onChange={setTopics} placeholder="Brave, Tiny, Glows in the dark" />
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#9A8A78" }}>These become trait tags and shape the auto-written description.</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {error && (
            <p role="alert" style={{ margin: 0, flex: "1 1 100%", color: "#b23a48", fontSize: "0.92rem" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !ready}
            style={{ padding: "14px 26px", borderRadius: 14, border: "none", background: ready ? "linear-gradient(135deg,#8B6DF0,#6A55C9)" : "#ECE1CE", color: ready ? "#fff" : "#9A8A78", fontWeight: 800, fontSize: "1rem", cursor: ready && !pending ? "pointer" : "not-allowed", boxShadow: ready ? "0 8px 20px rgba(106,85,201,0.3)" : "none" }}
          >
            {pending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "✓ Save changes" : "✨ Create character"}
          </button>
        </div>
      </form>

      {/* live character card preview */}
      <aside style={{ position: "sticky", top: 92, display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.72rem", fontWeight: 800, color: "#9A8A78" }}>Live preview</p>
        <div style={{ background: "#FFFDF9", border: "1px solid #ECE1CE", borderRadius: 22, padding: 20, boxShadow: "0 8px 22px rgba(58,40,80,0.07)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 62, height: 62, borderRadius: 20, background: "linear-gradient(150deg,#8B6DF0,#6A55C9)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem" }} aria-hidden="true">
              {characterEmoji(name)}
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem", color: "#2E2438" }}>{previewName}</h3>
              <span style={{ color: "#9A8A78", fontSize: "0.82rem", fontWeight: 700 }}>{isEdit ? "Appears in your stories" : "New · not in a story yet"}</span>
            </div>
          </div>
          <p style={{ margin: 0, color: "#6E6076", fontSize: "0.9rem", lineHeight: 1.45, minHeight: 42 }}>
            {previewDescription({ name, traits: splitList(topics), animals: splitList(favoriteAnimals), toys: splitList(favoriteToys) })}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {previewTags.map((t) => (
              <span key={t} style={{ padding: "4px 11px", borderRadius: 999, background: "#EDE7FE", color: "#6A55C9", fontSize: "0.76rem", fontWeight: 700 }}>{t}</span>
            ))}
          </div>
          <div style={{ height: 1, background: "#F0E6D2" }} />
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#9A8A78" }}>This is exactly how {previewName} appears on the Characters shelf.</p>
        </div>
        <div style={{ background: "#FBF4E7", border: "1px solid #F0E6D2", borderRadius: 18, padding: 16, display: "flex", gap: 11, alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.2rem" }} aria-hidden="true">🪄</span>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6E6076" }}>Made-up friends are text &amp; illustration only — they can co-star in any story.</p>
        </div>
      </aside>
    </div>
  );
}

function Field({
  id, label: lbl, value, onChange, placeholder, required, optional, hint,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; optional?: boolean; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={label}>
        {lbl}{" "}
        {optional && <span style={{ color: "#9A8A78", fontWeight: 600, fontSize: "0.85rem" }}>(optional)</span>}
        {hint && <span style={{ color: "#9A8A78", fontWeight: 600, fontSize: "0.85rem" }}>({hint})</span>}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} style={input} />
    </div>
  );
}
