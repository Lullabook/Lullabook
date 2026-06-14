"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createMomentAction } from "@/lib/actions";
import {
  MOMENT_TYPES,
  momentMeta,
  type MomentType,
  type RoutineEntry,
} from "@/domain/daily-types";
import type { LinkedPersonView } from "@/services/moment";
import { isCurrentWeek, nextWeekStart, previousWeekStart } from "@/services/moment-week";

export interface DailyMomentView {
  id: string;
  type: MomentType;
  text: string;
  date: string;
  isSignificant?: boolean;
  linkedPeople?: LinkedPersonView[];
}

export interface CastOption {
  id: string;
  name: string;
  kind: "adult" | "character";
}

export interface WeekDayView {
  date: string;
  label: string;
  moments: { id: string; text: string; isSignificant: boolean; type: MomentType }[];
}

interface DailyLifeClientProps {
  babyId: string;
  babyName: string;
  initialMoments: DailyMomentView[];
  routine: RoutineEntry[];
  memberId: string;
  castOptions: CastOption[];
  prefillDate?: string;
  initialView?: "timeline" | "week";
  weekStart: string;
  weekDays: WeekDayView[];
}

const cardStyle: CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 22,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function DailyLifeClient({
  babyId,
  babyName,
  initialMoments,
  routine,
  castOptions,
  prefillDate,
  initialView = "timeline",
  weekStart,
  weekDays,
}: DailyLifeClientProps) {
  const router = useRouter();
  const [view, setView] = useState<"timeline" | "week">(initialView);
  const [moments, setMoments] = useState<DailyMomentView[]>(initialMoments);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<MomentType>("milestone");
  const [selectedCast, setSelectedCast] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleCast(id: string) {
    setSelectedCast((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function addMoment() {
    const text = draft.trim();
    if (!text || pending) return;
    setError(null);
    const linkedPersonaIds = selectedCast.filter((id) =>
      castOptions.some((c) => c.id === id && c.kind === "adult")
    );
    const linkedCharacterIds = selectedCast.filter((id) =>
      castOptions.some((c) => c.id === id && c.kind === "character")
    );
    startTransition(async () => {
      const result = await createMomentAction({
        babyId,
        body: text,
        momentType: draftType,
        occurredOn: prefillDate,
        linkedPersonaIds,
        linkedCharacterIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const linkedPeople = castOptions
        .filter((c) => selectedCast.includes(c.id))
        .map((c) => ({
          personaId: c.kind === "adult" ? c.id : undefined,
          characterId: c.kind === "character" ? c.id : undefined,
          name: c.name,
          initial: c.name.charAt(0).toUpperCase(),
          kind: c.kind,
        }));
      setMoments((prev) => [
        {
          id: result.data.momentId,
          type: draftType,
          text,
          date: "Today",
          isSignificant: draftType === "milestone" || draftType === "first",
          linkedPeople,
        },
        ...prev,
      ]);
      setDraft("");
      setSelectedCast([]);
      router.refresh();
    });
  }

  function turnIntoStory(text: string) {
    router.push(`/storybooks/new?theme=${encodeURIComponent(text)}`);
  }

  function navigateWeek(offset: -1 | 1) {
    const target = offset < 0 ? previousWeekStart(weekStart) : nextWeekStart(weekStart);
    if (offset > 0 && !isCurrentWeek(weekStart)) return;
    router.push(`/daily?week=${target}`);
  }

  return (
    <div className="v2-stack" style={{ gap: 22 }}>
      <div>
        <p className="v2-eyebrow">📔 {babyName}&apos;s days</p>
        <h1 className="v2-page-title">Daily life</h1>
        <p className="v2-page-lead" style={{ maxWidth: 580 }}>
          Jot down the little moments and the routine. Lullabook weaves them into stories that feel
          like real days — and they make {babyName}&apos;s persona richer over time.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {(["timeline", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                if (v === "week") router.push(`/daily?week=${weekStart}`);
                else router.push("/daily");
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: `1.5px solid ${view === v ? "#8B6DF0" : "#ECE1CE"}`,
                background: view === v ? "#EDE7FE" : "#FFFDF9",
                color: view === v ? "#6A55C9" : "#6E6076",
                fontWeight: 800,
                fontSize: "0.82rem",
                cursor: "pointer",
                fontFamily: "var(--v2-font-body)",
              }}
            >
              {v === "timeline" ? "Timeline" : "This week"}
            </button>
          ))}
        </div>
      </div>

      {view === "week" ? (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem", color: "#2E2438" }}>
              Week of {weekStart}
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => navigateWeek(-1)} style={{ background: "#FFF8EC", border: "1px solid #ECE1CE", borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontWeight: 800, fontSize: "0.8rem", color: "#6A55C9" }}>
                ← Prev
              </button>
              {!isCurrentWeek(weekStart) ? (
                <button type="button" onClick={() => navigateWeek(1)} style={{ background: "#FFF8EC", border: "1px solid #ECE1CE", borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontWeight: 800, fontSize: "0.8rem", color: "#6A55C9" }}>
                  Next →
                </button>
              ) : null}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {weekDays.map((day) => (
              <div
                key={day.date}
                style={{
                  background: day.moments.length ? "#FFF8EC" : "#FBF4E7",
                  border: `1px solid ${day.moments.some((m) => m.isSignificant) ? "#E8D4A8" : "#ECE1CE"}`,
                  borderRadius: 16,
                  padding: 12,
                  minHeight: 100,
                }}
              >
                <p style={{ margin: "0 0 8px", fontWeight: 800, fontSize: "0.78rem", color: "#9A8A78" }}>{day.label}</p>
                {day.moments.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#C4B8A8" }}>—</p>
                ) : (
                  day.moments.map((m) => (
                    <p
                      key={m.id}
                      style={{
                        margin: "0 0 6px",
                        fontSize: "0.8rem",
                        color: "#2E2438",
                        fontWeight: m.isSignificant ? 800 : 600,
                        lineHeight: 1.35,
                      }}
                    >
                      {m.isSignificant ? "✨ " : ""}
                      {m.text.length > 48 ? `${m.text.slice(0, 48)}…` : m.text}
                    </p>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div style={{ display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={cardStyle}>
            <label htmlFor="moment" style={{ display: "block", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.15rem", color: "#2E2438", marginBottom: 4 }}>
              What happened today?
            </label>
            <p style={{ margin: "0 0 12px", color: "#9A8A78", fontSize: "0.88rem" }}>
              A milestone, a giggle, a hard nap day — anything worth remembering.
            </p>
            <textarea
              id="moment"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Waved bye-bye to Nani all by herself…"
              rows={3}
              style={{ width: "100%", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
            />
            {castOptions.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: "0 0 8px", fontSize: "0.82rem", fontWeight: 800, color: "#6E6076" }}>Who was there?</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {castOptions.map((c) => {
                    const active = selectedCast.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCast(c.id)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${active ? "#8B6DF0" : "#ECE1CE"}`, background: active ? "#EDE7FE" : "#FFFDF9", color: active ? "#6A55C9" : "#6E6076", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", fontFamily: "var(--v2-font-body)" }}
                      >
                        <span aria-hidden="true">{c.kind === "character" ? "🐻" : "💛"}</span>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              {MOMENT_TYPES.map((t) => {
                const active = draftType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDraftType(t.key)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${active ? "#8B6DF0" : "#ECE1CE"}`, background: active ? "#EDE7FE" : "#FFFDF9", color: active ? "#6A55C9" : "#6E6076", fontWeight: 800, fontSize: "0.82rem", cursor: "pointer", fontFamily: "var(--v2-font-body)" }}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={addMoment}
                disabled={!draft.trim() || pending}
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, border: "none", background: draft.trim() && !pending ? "linear-gradient(135deg,#8B6DF0,#6A55C9)" : "#E7DCCB", color: draft.trim() && !pending ? "#fff" : "#9A8A78", fontWeight: 800, fontSize: "0.92rem", cursor: draft.trim() && !pending ? "pointer" : "not-allowed", boxShadow: draft.trim() && !pending ? "0 8px 20px rgba(106,85,201,0.3)" : "none" }}
              >
                ＋ Add moment
              </button>
            </div>
            {error ? (
              <p role="alert" style={{ margin: "12px 0 0", color: "#B5618A", fontSize: "0.88rem", fontWeight: 700 }}>
                {error}
              </p>
            ) : null}
          </div>

          <div>
            <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.4rem", margin: "0 0 14px", color: "#2E2438" }}>Recent moments</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {moments.length === 0 ? (
                <p style={{ color: "#9A8A78", fontSize: "0.92rem" }}>No moments yet — log the first one above.</p>
              ) : null}
              {moments.map((m) => {
                const meta = momentMeta(m.type);
                return (
                  <div key={m.id} style={{ background: "#FFFDF9", border: `1px solid ${m.isSignificant ? "#E8D4A8" : "#ECE1CE"}`, borderRadius: 18, padding: 18, boxShadow: "0 8px 22px rgba(58,40,80,0.05)", display: "flex", gap: 14 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", background: meta.bg }} aria-hidden="true">{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, background: meta.bg, color: meta.fg, fontSize: "0.74rem", fontWeight: 800 }}>{meta.label}</span>
                        {m.isSignificant ? (
                          <span style={{ fontSize: "0.74rem" }} aria-label="Significant">✨</span>
                        ) : null}
                        <span style={{ fontSize: "0.8rem", color: "#A99FB0", fontWeight: 700 }}>{m.date}</span>
                      </div>
                      <p style={{ margin: "0 0 10px", color: "#2E2438", fontSize: "0.96rem", lineHeight: 1.5 }}>{m.text}</p>
                      {m.linkedPeople && m.linkedPeople.length > 0 ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                          {m.linkedPeople.map((p) => (
                            <span
                              key={p.personaId ?? p.characterId}
                              title={p.name}
                              style={{ width: 28, height: 28, borderRadius: 999, background: "#EDE7FE", color: "#6A55C9", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 800 }}
                            >
                              {p.initial}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => turnIntoStory(m.text)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, border: "1px solid #ECE1CE", background: "#FFF8EC", color: "#6A55C9", fontWeight: 800, fontSize: "0.82rem", cursor: "pointer", fontFamily: "var(--v2-font-body)" }}
                      >
                        ✨ Turn into a story
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#FFFDF9", border: "1px solid #ECE1CE", borderRadius: 22, padding: 20, boxShadow: "0 8px 22px rgba(58,40,80,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem", color: "#2E2438" }}>🕒 Their usual day</h3>
              <button type="button" style={{ background: "none", border: "none", color: "#6A55C9", fontWeight: 800, fontSize: "0.82rem", cursor: "pointer", padding: 0, fontFamily: "var(--v2-font-body)" }}>Edit</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {routine.map((r) => (
                <div key={`${r.time}-${r.label}`} style={{ display: "flex", alignItems: "center", gap: 13, padding: "9px 0", borderBottom: "1px solid #F4ECDC" }}>
                  <span style={{ width: 70, flexShrink: 0, fontSize: "0.8rem", fontWeight: 800, color: "#9A8A78", fontVariantNumeric: "tabular-nums" }}>{prettyTime(r.time)}</span>
                  <span style={{ fontSize: "1.05rem" }} aria-hidden="true">{r.icon}</span>
                  <span style={{ fontSize: "0.92rem", color: "#2E2438", fontWeight: 700 }}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "linear-gradient(160deg,#6A55C9,#B5739E)", borderRadius: 20, padding: 20, color: "#fff", boxShadow: "0 14px 32px rgba(106,85,201,0.26)" }}>
            <p style={{ margin: "0 0 8px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.1rem" }}>Why this helps ✨</p>
            <p style={{ margin: 0, color: "#FBEAF3", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Real moments and routines teach Lullabook who {babyName} is — favorite times of day, what
              delights them — so every story sounds like their actual life, not a generic one.
            </p>
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}
