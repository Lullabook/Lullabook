"use client";

import Link from "next/link";
import { useTransition } from "react";
import { dismissDailyNudgeAction, markWeeklySuggestionSeenAction } from "@/lib/actions";

const cardStyle: React.CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 20,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

export function WorldJournalCards({
  dailyNudge,
  weeklySuggestion,
}: {
  dailyNudge: { show: boolean; captureHref: string; babyName: string; babyId: string } | null;
  weeklySuggestion: {
    show: boolean;
    createHref: string;
    babyName: string;
    babyId: string;
    momentCount: number;
  } | null;
}) {
  const [pending, startTransition] = useTransition();

  if (!dailyNudge?.show && !weeklySuggestion?.show) return null;

  return (
    <div className="v2-stack" style={{ gap: 14 }}>
      {dailyNudge?.show ? (
        <div style={{ ...cardStyle, borderColor: "#D4C4F0", background: "linear-gradient(135deg,#FFFDF9,#F6F0FF)" }}>
          <p style={{ margin: "0 0 6px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.1rem", color: "#2E2438" }}>
            What happened today?
          </p>
          <p style={{ margin: "0 0 14px", color: "#6E6076", fontSize: "0.9rem", lineHeight: 1.45 }}>
            Jot a quick moment about {dailyNudge.babyName}&apos;s day — it helps every story feel more real.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link
              href={dailyNudge.captureHref}
              className="v2-btn v2-btn--primary"
              style={{ fontSize: "0.88rem", padding: "10px 18px" }}
            >
              ＋ Log a moment
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await dismissDailyNudgeAction(dailyNudge.babyId);
                })
              }
              style={{ background: "none", border: "none", color: "#9A8A78", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "var(--v2-font-body)" }}
            >
              Not today
            </button>
          </div>
        </div>
      ) : null}

      {weeklySuggestion?.show ? (
        <div style={{ ...cardStyle, borderColor: "#E8D4A8", background: "linear-gradient(135deg,#FFFDF9,#FFF8EC)" }}>
          <p style={{ margin: "0 0 6px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.1rem", color: "#2E2438" }}>
            Turn this week into a story ✨
          </p>
          <p style={{ margin: "0 0 14px", color: "#6E6076", fontSize: "0.9rem", lineHeight: 1.45 }}>
            {weeklySuggestion.momentCount} moments this week — we can draft a story starring{" "}
            {weeklySuggestion.babyName} and everyone who was there.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link
              href={weeklySuggestion.createHref}
              onClick={() =>
                startTransition(async () => {
                  await markWeeklySuggestionSeenAction(weeklySuggestion.babyId);
                })
              }
              className="v2-btn v2-btn--amber"
              style={{ fontSize: "0.88rem", padding: "10px 18px" }}
            >
              See suggestion →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
