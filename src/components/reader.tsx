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
    <div className="reader">
      <div className="reader-page" aria-live="polite">
        {page.imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.imageSrc} alt={`Illustration for page ${page.index + 1} of ${title}`} />
        ) : (
          <div
            className="illustration-hole"
            style={{ borderRadius: 0, border: "none" }}
            aria-hidden="true"
          >
            <span style={{ fontSize: "2rem" }}>🌙</span>
          </div>
        )}
        <p className="page-text">{page.text}</p>
      </div>
      <div className="reader-controls">
        <button
          className="btn btn-secondary"
          onClick={goPrev}
          disabled={current === 0}
          aria-label="Previous page"
        >
          ← Back
        </button>
        <span className="subtle" aria-label={`Page ${current + 1} of ${pages.length}`}>
          {current + 1} / {pages.length}
        </span>
        <button
          className="btn btn-secondary"
          onClick={goNext}
          disabled={current === pages.length - 1}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
