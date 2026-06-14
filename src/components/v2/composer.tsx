"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RosterAvatar } from "@/components/v2/roster-avatar";
import type { PersonaStatus } from "@/domain/types";
import { AVATAR_GRADIENTS } from "@/lib/v2-theme";
import {
  generateStorybookAction,
  submitBriefWhileTrainingAction,
} from "@/lib/actions";

interface CastPersona {
  id: string;
  displayName: string;
  status: PersonaStatus;
  avatarKey?: string | null;
}

interface CastCharacter {
  id: string;
  displayName: string;
}

const STORY_TYPES: { type: StoryType; icon: string; label: string; desc: string }[] = [
  { type: "everyday", icon: "🌼", label: "Everyday", desc: "A cozy slice of the day" },
  { type: "milestone", icon: "🎉", label: "Milestone", desc: "Celebrate a big first" },
  { type: "adventure", icon: "🚀", label: "Adventure", desc: "A brave little quest" },
  { type: "lesson", icon: "🌟", label: "Lesson", desc: "A gentle thing to learn" },
  { type: "bedtime", icon: "🌙", label: "Bedtime", desc: "A sleepy wind-down" },
  { type: "silly", icon: "😄", label: "Silly", desc: "Giggles and nonsense" },
];

const ART_STYLES: { value: string; icon: string; label: string }[] = [
  { value: "Soft watercolor", icon: "🎨", label: "Soft watercolor" },
  { value: "Dreamy pastel", icon: "☁️", label: "Dreamy pastel" },
  { value: "Bold & bright", icon: "🌈", label: "Bold & bright" },
  { value: "Storybook ink", icon: "✒️", label: "Storybook ink" },
];

const PAGE_COUNTS = [8, 12, 16];

const TRY_CHIPS: { text: string; bg: string; color: string }[] = [
  { text: "A trip to the moon", bg: "#EDE7FE", color: "#6A55C9" },
  { text: "The first snow", bg: "#FBEBCE", color: "#9A6B1E" },
  { text: "Learning to share", bg: "#E1F1E8", color: "#3E7A5A" },
];

const cardStyle: React.CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 22,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

export function V2Composer({
  babyName,
  babyPersona,
  adults,
  characters,
  initialTheme = "",
  initialAdultIds = [],
  initialCharacterIds = [],
}: {
  babyName: string;
  babyPersona: CastPersona | null;
  adults: CastPersona[];
  characters: CastCharacter[];
  initialTheme?: string;
  initialAdultIds?: string[];
  initialCharacterIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [theme, setTheme] = useState(initialTheme);
  const [selectedAdults, setSelectedAdults] = useState<string[]>(initialAdultIds);
  const [selectedChars, setSelectedChars] = useState<string[]>(initialCharacterIds);
  const [storyType, setStoryType] = useState<StoryType>("bedtime");
  const [artStyle, setArtStyle] = useState<string>("Soft watercolor");
  const [pageCount, setPageCount] = useState<number>(12);

  const toggle = (id: string, list: string[], set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const castSummary = useMemo(() => {
    const names: string[] = [];
    if (babyPersona) names.push(babyName);
    for (const a of adults) if (selectedAdults.includes(a.id)) names.push(a.displayName);
    for (const c of characters) if (selectedChars.includes(c.id)) names.push(c.displayName);
    return names.length ? names.join(", ") : babyName;
  }, [babyPersona, babyName, adults, characters, selectedAdults, selectedChars]);

  function submit() {
    setError(null);
    if (!theme.trim()) {
      setError("Tell us the idea — what is the story about?");
      return;
    }
    const starringPersonaIds = [
      ...(babyPersona && babyPersona.status === "ready" ? [babyPersona.id] : []),
      ...selectedAdults,
    ];
    const brief: Brief = {
      starringPersonaIds,
      starringCharacterIds: selectedChars.length ? selectedChars : undefined,
      storyType,
      theme: theme.trim(),
      artStyle,
      pageCount,
    };

    startTransition(async () => {
      const readyIds = [
        ...(babyPersona && babyPersona.status === "ready" ? [babyPersona.id] : []),
        ...adults.filter((a) => a.status === "ready" && selectedAdults.includes(a.id)).map((a) => a.id),
      ];
      const trainingSelected = adults.filter(
        (a) => a.status === "training" && selectedAdults.includes(a.id)
      );
      // Cold start: a single still-training cast member, nobody ready yet.
      if (readyIds.length === 0 && trainingSelected.length === 1) {
        const res = await submitBriefWhileTrainingAction(trainingSelected[0].id, brief);
        if (!res.ok) return setError(res.error);
        router.push("/stories?queued=1");
        return;
      }
      const res = await generateStorybookAction(brief);
      if (!res.ok) return setError(res.error);
      router.push(`/storybooks/${res.data.storybookId}`);
    });
  }

  return (
    <div className="v2-composer">
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {/* Brief / theme */}
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.15rem", margin: "0 0 4px" }}>
            What&apos;s the story about?
          </h2>
          <p style={{ color: "#9A8A78", fontSize: "0.9rem", margin: "0 0 12px" }}>
            One line is plenty — a moment, a lesson, an adventure.
          </p>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="A trip to the moon, the first snow, learning to share…"
            style={{
              width: "100%",
              background: "#FBF4E7",
              border: "1px solid #ECE1CE",
              borderRadius: 14,
              padding: "14px 16px",
              fontFamily: "var(--v2-font-body, inherit)",
              fontSize: "1.05rem",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#9A8A78" }}>Try:</span>
            {TRY_CHIPS.map((chip) => (
              <button
                key={chip.text}
                type="button"
                onClick={() => setTheme(chip.text)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  background: chip.bg,
                  color: chip.color,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                }}
              >
                {chip.text}
              </button>
            ))}
          </div>
        </div>

        {/* Cast */}
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.15rem", margin: "0 0 4px" }}>
            Who stars?
          </h2>
          <p style={{ color: "#9A8A78", fontSize: "0.9rem", margin: "0 0 12px" }}>
            {babyName} always stars. Add family and made-up friends.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <CastChip
              label={babyName}
              kind="Baby"
              selected
              disabled
              avatarIndex={0}
              initial={babyName[0]}
              personaStatus={babyPersona?.status}
              avatarKey={babyPersona?.avatarKey}
            />
            {adults.map((a, i) => (
              <CastChip
                key={a.id}
                label={a.displayName}
                kind={a.status === "ready" ? "Family" : a.status === "training" ? "Training…" : "Needs photos"}
                selected={selectedAdults.includes(a.id)}
                onClick={() => toggle(a.id, selectedAdults, setSelectedAdults)}
                avatarIndex={i + 1}
                initial={a.displayName[0]}
                personaStatus={a.status}
                avatarKey={a.avatarKey}
              />
            ))}
            {characters.map((c, i) => (
              <CastChip
                key={c.id}
                label={c.displayName}
                kind="Character"
                selected={selectedChars.includes(c.id)}
                onClick={() => toggle(c.id, selectedChars, setSelectedChars)}
                avatarIndex={i + 2}
                initial={c.displayName[0]}
              />
            ))}
          </div>
        </div>

        {/* Story type */}
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.15rem", margin: "0 0 12px" }}>
            What kind of story?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {STORY_TYPES.map((st) => {
              const active = storyType === st.type;
              return (
                <button
                  key={st.type}
                  type="button"
                  onClick={() => setStoryType(st.type)}
                  style={{
                    textAlign: "left",
                    padding: 16,
                    borderRadius: 16,
                    border: `1.5px solid ${active ? "#8B6DF0" : "#ECE1CE"}`,
                    background: active ? "#EDE7FE" : "#FFFDF9",
                    boxShadow: active ? "0 6px 18px rgba(139,109,240,0.16)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: "1.5rem" }}>{st.icon}</div>
                  <div style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1rem", color: active ? "#4A3D6B" : "#2E2438" }}>
                    {st.label}
                  </div>
                  <div style={{ fontSize: "0.82rem", opacity: 0.78, color: "#6E6076" }}>{st.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Art style + length */}
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.1rem", margin: "0 0 12px" }}>
            Art style
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {ART_STYLES.map((s) => {
              const active = artStyle === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setArtStyle(s.value)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 999,
                    border: `1.5px solid ${active ? "#8B6DF0" : "#ECE1CE"}`,
                    background: active ? "#EDE7FE" : "#FFFDF9",
                    color: active ? "#4A3D6B" : "#6E6076",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {s.icon} {s.label}
                </button>
              );
            })}
          </div>
          <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.1rem", margin: "0 0 12px" }}>
            How long?
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            {PAGE_COUNTS.map((n) => {
              const active = pageCount === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageCount(n)}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    borderRadius: 999,
                    border: `1.5px solid ${active ? "#8B6DF0" : "#ECE1CE"}`,
                    background: active ? "#EDE7FE" : "#FFFDF9",
                    color: active ? "#4A3D6B" : "#6E6076",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {n} pages
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right rail: live brief preview */}
      <aside className="v2-brief-rail">
        <p style={{ textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.72rem", fontWeight: 800, color: "#FFE9C9", margin: "0 0 14px" }}>
          Your brief
        </p>
        <div
          style={{
            aspectRatio: "4/5",
            borderRadius: 16,
            background: "linear-gradient(160deg,#3b2f6e,#6a55c9)",
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            padding: 16,
            marginBottom: 18,
            overflow: "hidden",
          }}
        >
          <span style={{ position: "absolute", top: 16, right: 18, width: 30, height: 30, borderRadius: "50%", background: "#F6C177", boxShadow: "0 0 20px rgba(246,193,119,0.6)" }} aria-hidden="true" />
          <span style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#FAF4E6", fontSize: "1.1rem" }}>
            {theme.trim() || "Your story title"}
          </span>
        </div>
        {[
          { label: "Starring", value: castSummary },
          { label: "Kind", value: STORY_TYPES.find((s) => s.type === storyType)!.label },
          { label: "Art", value: artStyle },
          { label: "Length", value: `${pageCount} pages` },
        ].map((row, idx) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 0",
              fontSize: "0.92rem",
              borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <span style={{ color: "#FBEAF3" }}>{row.label}</span>
            <span style={{ color: "#fff", fontWeight: 800, textAlign: "right" }}>{row.value}</span>
          </div>
        ))}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          style={{
            width: "100%",
            marginTop: 14,
            padding: 15,
            borderRadius: 14,
            border: "none",
            background: "#FFFDF9",
            color: "#6A55C9",
            fontSize: "1.02rem",
            fontWeight: 800,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Tucking the story in…" : "✨ Generate story"}
        </button>
        <p style={{ textAlign: "center", color: "#FBEAF3", fontSize: "0.8rem", margin: "10px 0 0" }}>
          About 4 minutes to your first pages
        </p>
      </aside>
    </div>
  );
}

function CastChip({
  label,
  kind,
  selected,
  disabled,
  onClick,
  avatarIndex,
  initial,
  personaStatus,
  avatarKey,
}: {
  label: string;
  kind: string;
  selected: boolean;
  disabled?: boolean;
  onClick?: () => void;
  avatarIndex: number;
  initial?: string;
  personaStatus?: PersonaStatus;
  avatarKey?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 14px 9px 9px",
        borderRadius: 999,
        border: `1.5px solid ${selected ? "#8B6DF0" : "#ECE1CE"}`,
        background: selected ? "#EDE7FE" : "#FFFDF9",
        color: selected ? "#4A3D6B" : "#2E2438",
        boxShadow: selected ? "0 0 0 3px rgba(139,109,240,0.12)" : "none",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {personaStatus ? (
        <RosterAvatar
          name={label}
          initial={(initial ?? "?").toUpperCase()}
          avBg={AVATAR_GRADIENTS[avatarIndex % AVATAR_GRADIENTS.length]!}
          status={personaStatus}
          avatarKey={avatarKey}
          size={34}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: AVATAR_GRADIENTS[avatarIndex % AVATAR_GRADIENTS.length],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: "0.9rem",
          }}
        >
          {(initial ?? "?").toUpperCase()}
        </span>
      )}
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, textAlign: "left" }}>
        <span style={{ fontSize: "0.92rem", fontWeight: 800 }}>{label}</span>
        <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>
          {selected ? "✓ " : ""}
          {kind}
        </span>
      </span>
    </button>
  );
}
