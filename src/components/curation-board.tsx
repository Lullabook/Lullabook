"use client";

import { useState, useTransition } from "react";
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

  return (
    <div className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="card row between">
        <div>
          <strong>{rerollBudgetRemaining}</strong>{" "}
          <span className="muted">free re-rolls</span>
          {" · "}
          <strong>{rerollCredits}</strong>{" "}
          <span className="muted">purchased credits</span>
        </div>
        <div className="row">
          {rerollsLeft === 0 && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={pending}
              onClick={() => run(() => buyRerollCreditsAction(storybookId, 5))}
            >
              Buy 5 re-roll credits
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => run(() => finalizeStorybookAction(storybookId))}
          >
            Finalize storybook
          </button>
        </div>
      </div>

      {pages.map((page) => (
        <section key={page.id} className="card" aria-label={`Page ${page.index + 1}`}>
          <div className="curation-page">
            <div>
              {page.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.imageSrc} alt={`Illustration for page ${page.index + 1}`} />
              ) : (
                <div className="illustration-hole">
                  <span aria-hidden="true" style={{ fontSize: "1.6rem" }}>
                    {page.generationStatus === "quarantined" ? "🛡️" : "🌫️"}
                  </span>
                  <span>
                    {page.generationStatus === "quarantined"
                      ? "This illustration didn't pass our safety check."
                      : "This illustration didn't come out."}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => run(() => recoverPageAction(page.id, storybookId))}
                  >
                    Try again (free)
                  </button>
                </div>
              )}
            </div>
            <div>
              <p className="eyebrow">Page {page.index + 1}</p>
              {editingPage === page.id ? (
                <div className="stack">
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    aria-label={`New text for page ${page.index + 1}`}
                  />
                  <div className="row">
                    <button
                      className="btn btn-primary btn-sm"
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
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingPage(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>
                  {page.text}
                </p>
              )}

              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pending || rerollsLeft === 0 || page.imageSrc === null}
                  onClick={() => run(() => rerollImageAction(page.id, storybookId))}
                >
                  Re-roll illustration
                </button>
                <button
                  className="btn btn-secondary btn-sm"
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
                  <p className="subtle" style={{ margin: "12px 0 4px" }}>
                    Candidates — pick your favorite:
                  </p>
                  <div className="candidate-row">
                    {page.candidates.map((c) => (
                      <button
                        key={c.id}
                        className={`chip${c.selected ? " selected" : ""}`}
                        style={
                          c.selected
                            ? { borderColor: "var(--amber-400)", color: "var(--cream-100)" }
                            : undefined
                        }
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
