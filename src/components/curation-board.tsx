"use client";

import { useState, useTransition, type CSSProperties } from "react";
import {
  buyRerollCreditsAction,
  finalizeStorybookAction,
  recoverPageAction,
  rerollImageAction,
  rerollTextAction,
  selectCandidateAction,
} from "@/lib/actions";

export interface CurationPage {
  id: string;
  index: number;
  text: string;
  generationStatus: string;
  imageSrc: string | null;
  candidates: {
    id: string;
    kind: "text" | "image";
    content: string;
    selected: boolean;
  }[];
}

interface CurationBoardProps {
  storybookId: string;
  pages: CurationPage[];
  rerollBudgetRemaining: number;
  rerollCredits: number;
}

export function CurationBoard({
  storybookId,
  pages,
  rerollBudgetRemaining,
  rerollCredits,
}: CurationBoardProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
    });
  }

  const rerollsLeft = rerollBudgetRemaining + rerollCredits;

  const cardStyle: CSSProperties = {
    background: "#FFFDF9",
    border: "1px solid #ECE1CE",
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
  };
  const eyebrow: CSSProperties = {
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontSize: "0.74rem",
    fontWeight: 800,
    color: "#8B6DF0",
    margin: "0 0 8px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {error && (
        <div
          role="alert"
          style={{ borderRadius: 16, padding: "14px 16px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48", fontSize: "0.92rem" }}
        >
          {error}
        </div>
      )}

      <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ color: "#6E6076", fontSize: "0.92rem" }}>
          <strong style={{ color: "#2E2438" }}>{rerollBudgetRemaining}</strong> free re-rolls
          {" · "}
          <strong style={{ color: "#2E2438" }}>{rerollCredits}</strong> purchased credits
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {rerollsLeft === 0 && (
            <button
              type="button"
              className="v2-btn v2-btn--ghost-surface"
              style={{ padding: "9px 16px", fontSize: "0.88rem" }}
              disabled={pending}
              onClick={() => run(() => buyRerollCreditsAction(storybookId, 5))}
            >
              Buy 5 re-roll credits
            </button>
          )}
          <button
            type="button"
            className="v2-btn v2-btn--primary"
            style={{ padding: "9px 18px", fontSize: "0.88rem" }}
            disabled={pending}
            onClick={() => run(() => finalizeStorybookAction(storybookId))}
          >
            ✓ Finalize storybook
          </button>
        </div>
      </div>

      {pages.map((page) => (
        <section key={page.id} style={cardStyle} aria-label={`Page ${page.index + 1}`}>
          <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0,240px) 1fr", alignItems: "start" }}>
            <div>
              {page.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={page.imageSrc}
                  alt={`Illustration for page ${page.index + 1}`}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 16, border: "1px solid #ECE1CE", background: "#FBF4E7" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    borderRadius: 16,
                    border: "2px dashed #D8C9B0",
                    background: "#FFF8EC",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    textAlign: "center",
                    padding: 16,
                    color: "#9A8A78",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: "1.8rem" }}>
                    {page.generationStatus === "quarantined" ? "🛡️" : "🌫️"}
                  </span>
                  <span style={{ fontSize: "0.86rem" }}>
                    {page.generationStatus === "quarantined"
                      ? "This illustration didn't pass our safety check."
                      : "This illustration didn't come out."}
                  </span>
                  <button
                    type="button"
                    className="v2-btn v2-btn--ghost-surface"
                    style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                    disabled={pending}
                    onClick={() => run(() => recoverPageAction(page.id, storybookId))}
                  >
                    Try again (free)
                  </button>
                </div>
              )}
            </div>
            <div>
              <p style={eyebrow}>Page {page.index + 1}</p>
              {editingPage === page.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    aria-label={`New text for page ${page.index + 1}`}
                    style={{ width: "100%", fontFamily: "var(--v2-font-body)", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "12px 14px", minHeight: 96, resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="v2-btn v2-btn--primary"
                      style={{ padding: "9px 16px", fontSize: "0.85rem" }}
                      disabled={pending || !draftText.trim()}
                      onClick={() =>
                        run(async () => {
                          const res = await rerollTextAction(
                            page.id,
                            draftText.trim(),
                            storybookId
                          );
                          if (res.ok) setEditingPage(null);
                          return res;
                        })
                      }
                    >
                      Save as candidate (1 re-roll)
                    </button>
                    <button
                      type="button"
                      className="v2-btn v2-btn--ghost-surface"
                      style={{ padding: "9px 16px", fontSize: "0.85rem" }}
                      onClick={() => setEditingPage(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontFamily: "var(--v2-font-display)", fontSize: "1.1rem", color: "#2E2438", lineHeight: 1.6, margin: 0 }}>
                  {page.text}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  type="button"
                  className="v2-btn v2-btn--ghost-surface"
                  style={{ padding: "8px 14px", fontSize: "0.82rem", opacity: pending || rerollsLeft === 0 || page.imageSrc === null ? 0.5 : 1 }}
                  disabled={pending || rerollsLeft === 0 || page.imageSrc === null}
                  onClick={() => run(() => rerollImageAction(page.id, storybookId))}
                >
                  Re-roll illustration
                </button>
                <button
                  type="button"
                  className="v2-btn v2-btn--ghost-surface"
                  style={{ padding: "8px 14px", fontSize: "0.82rem", opacity: pending || rerollsLeft === 0 || editingPage === page.id ? 0.5 : 1 }}
                  disabled={pending || rerollsLeft === 0 || editingPage === page.id}
                  onClick={() => {
                    setDraftText(page.text);
                    setEditingPage(page.id);
                  }}
                >
                  Rewrite text
                </button>
              </div>

              {page.candidates.length > 0 && (
                <>
                  <p style={{ margin: "14px 0 6px", color: "#9A8A78", fontSize: "0.82rem", fontWeight: 700 }}>
                    Candidates — pick your favorite:
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {page.candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 14px",
                          borderRadius: 999,
                          border: `1.5px solid ${c.selected ? "#8B6DF0" : "#ECE1CE"}`,
                          background: c.selected ? "#EDE7FE" : "#FFFDF9",
                          color: c.selected ? "#6A55C9" : "#6E6076",
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          cursor: pending ? "not-allowed" : "pointer",
                        }}
                        disabled={pending}
                        onClick={() =>
                          run(() => selectCandidateAction(c.id, storybookId))
                        }
                      >
                        {c.kind === "image"
                          ? `🖼️ Illustration ${c.selected ? "✓" : ""}`
                          : `✏️ “${c.content.slice(0, 36)}${c.content.length > 36 ? "…" : ""}” ${c.selected ? "✓" : ""}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
