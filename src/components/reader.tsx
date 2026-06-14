"use client";

import { useCallback, useEffect, useState } from "react";

export interface ReaderPage {
  index: number;
  text: string;
  imageSrc: string | null;
}

interface ReaderProps {
  title: string;
  pages: ReaderPage[];
}

/** Immersive page-turn reader: swipe-friendly buttons + arrow keys. */
export function Reader({ title, pages }: ReaderProps) {
  const [current, setCurrent] = useState(0);
  const page = pages[current];

  const goNext = useCallback(
    () => setCurrent((c) => Math.min(c + 1, pages.length - 1)),
    [pages.length]
  );
  const goPrev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  if (!page) return null;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div
        aria-live="polite"
        style={{
          background: "#FFFDF9",
          border: "1px solid #ECE1CE",
          borderRadius: 26,
          overflow: "hidden",
          boxShadow: "0 24px 56px rgba(58,40,80,0.14)",
        }}
      >
        {page.imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.imageSrc}
            alt={`Illustration for page ${page.index + 1} of ${title}`}
            style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover", background: "#FBF4E7" }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              aspectRatio: "1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(160deg,#3b2f6e,#6a55c9)",
            }}
          >
            <span style={{ fontSize: "2.4rem" }}>🌙</span>
          </div>
        )}
        <p
          style={{
            fontFamily: "var(--v2-font-display)",
            fontSize: "clamp(1.1rem, 2.6vw, 1.35rem)",
            lineHeight: 1.7,
            color: "#2E2438",
            margin: 0,
            padding: "26px 28px",
          }}
        >
          {page.text}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 18 }}>
        <button
          type="button"
          className="v2-btn v2-btn--ghost-surface"
          onClick={goPrev}
          disabled={current === 0}
          aria-label="Previous page"
          style={{ opacity: current === 0 ? 0.5 : 1 }}
        >
          ← Back
        </button>
        <span style={{ color: "#9A8A78", fontWeight: 700, fontSize: "0.9rem" }} aria-label={`Page ${current + 1} of ${pages.length}`}>
          {current + 1} / {pages.length}
        </span>
        <button
          type="button"
          className="v2-btn v2-btn--primary"
          onClick={goNext}
          disabled={current === pages.length - 1}
          aria-label="Next page"
          style={{ opacity: current === pages.length - 1 ? 0.5 : 1 }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
