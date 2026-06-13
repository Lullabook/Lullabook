"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  MOMENT_TYPES,
  momentMeta,
  type MomentType,
  type RoutineEntry,
} from "@/domain/daily-types";

export interface DailyMomentView {
  id: string;
  type: MomentType;
  text: string;
  date: string;
}

interface DailyLifeClientProps {
  babyName: string;
  initialMoments: DailyMomentView[];
  routine: RoutineEntry[];
  memberId: string;
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

export function DailyLifeClient({ babyName, initialMoments, routine }: DailyLifeClientProps) {
  const router = useRouter();
  const [moments, setMoments] = useState<DailyMomentView[]>(initialMoments);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<MomentType>("milestone");

  function addMoment() {
    const text = draft.trim();
    if (!text) return;
    // TODO: persist via a createDayMomentAction(formData) server action, then
    // revalidate. Optimistic local insert for now:
    setMoments((prev) => [
      { id: `tmp-${Date.now()}`, type: draftType, text, date: "Today · just now" },
      ...prev,
    ]);
    setDraft("");
  }

  function turnIntoStory(text: string) {
    // TODO: carry the moment text into the brief as a prefilled theme.
    router.push(`/storybooks/new?theme=${encodeURIComponent(text)}`);
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
      </div>

      <div style={{ display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* add a moment */}
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
                disabled={!draft.trim()}
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, border: "none", background: draft.trim() ? "linear-gradient(135deg,#8B6DF0,#6A55C9)" : "#E7DCCB", color: draft.trim() ? "#fff" : "#9A8A78", fontWeight: 800, fontSize: "0.92rem", cursor: draft.trim() ? "pointer" : "not-allowed", boxShadow: draft.trim() ? "0 8px 20px rgba(106,85,201,0.3)" : "none" }}
              >
                ＋ Add moment
              </button>
            </div>
          </div>

          {/* feed */}
          <div>
            <h2 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.4rem", margin: "0 0 14px", color: "#2E2438" }}>Recent moments</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {moments.map((m) => {
                const meta = momentMeta(m.type);
                return (
                  <div key={m.id} style={{ background: "#FFFDF9", border: "1px solid #ECE1CE", borderRadius: 18, padding: 18, boxShadow: "0 8px 22px rgba(58,40,80,0.05)", display: "flex", gap: 14 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", background: meta.bg }} aria-hidden="true">{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, background: meta.bg, color: meta.fg, fontSize: "0.74rem", fontWeight: 800 }}>{meta.label}</span>
                        <span style={{ fontSize: "0.8rem", color: "#A99FB0", fontWeight: 700 }}>{m.date}</span>
                      </div>
                      <p style={{ margin: "0 0 10px", color: "#2E2438", fontSize: "0.96rem", lineHeight: 1.5 }}>{m.text}</p>
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

        {/* routine + why */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#FFFDF9", border: "1px solid #ECE1CE", borderRadius: 22, padding: 20, boxShadow: "0 8px 22px rgba(58,40,80,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem", color: "#2E2438" }}>🕒 Their usual day</h3>
              {/* TODO: open routine editor */}
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
    </div>
  );
}
