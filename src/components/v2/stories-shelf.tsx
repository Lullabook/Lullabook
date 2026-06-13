"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StorybookStatus } from "@/domain/types";
import { BookCover } from "@/components/v2/book-cover";

export interface ShelfBook {
  id: string;
  title: string;
  status: StorybookStatus;
  cast: string;
  date: string;
  href: string;
}

export interface ContinueReading {
  id: string;
  title: string;
  cast: string;
  resumeHref: string;
}

type Filter = "all" | "finalized" | "draft" | "generating";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "finalized", label: "Finalized" },
  { key: "draft", label: "Drafts" },
  { key: "generating", label: "Generating" },
];

export function StoriesShelf({
  books,
  continueReading,
}: {
  books: ShelfBook[];
  continueReading: ContinueReading | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => (filter === "all" ? books : books.filter((b) => b.status === filter)),
    [books, filter]
  );

  return (
    <>
      {continueReading && (
        <section className="v2-continue-banner">
          <div className="v2-continue-banner__cover" aria-hidden="true">
            <span className="v2-continue-banner__cover-title">{continueReading.title}</span>
          </div>
          <div className="v2-continue-banner__body">
            <p className="v2-continue-banner__label">📖 Continue reading</p>
            <h2 className="v2-continue-banner__title">{continueReading.title}</h2>
            <p className="v2-continue-banner__meta">{continueReading.cast}</p>
            <div className="v2-continue-banner__progress" aria-hidden="true">
              <span className="v2-continue-banner__progress-fill" />
            </div>
            <div className="v2-continue-banner__actions">
              <Link className="v2-btn v2-btn--cream" href={continueReading.resumeHref}>
                ▶ Resume reading
              </Link>
              <Link className="v2-btn v2-btn--ghost-light" href={`/storybooks/${continueReading.id}`}>
                Share
              </Link>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="v2-shelf-head">
          <h2 className="v2-section-title">Every story so far</h2>
          <div className="v2-filter-row" role="tablist" aria-label="Filter stories">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`v2-filter-chip${filter === f.key ? " v2-filter-chip--active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="v2-page-lead">No {filter === "all" ? "" : filter} stories yet.</p>
        ) : (
          <div className="v2-book-grid">
            {visible.map((book) => (
              <BookCover
                key={book.id}
                title={book.title}
                status={book.status}
                href={book.href}
                cast={book.cast}
                date={book.date}
                seed={book.id}
              />
            ))}
            <Link
              href="/storybooks/new"
              className="v2-book-cover"
              style={{
                border: "2px dashed #D8C9B0",
                background: "#FFF8EC",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: "#9A8A78",
                fontWeight: 800,
                textDecoration: "none",
                aspectRatio: "4/5",
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                  boxShadow: "0 6px 16px rgba(58,40,80,0.1)",
                }}
              >
                ＋
              </span>
              New Story
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
