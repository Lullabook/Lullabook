"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PageStatus {
  id: string;
  index: number;
  generationStatus: string;
}

interface GenerationProgressProps {
  storybookId: string;
  initialPages: PageStatus[];
  expectedPageCount: number;
}

/**
 * Live progress while the durable workflow streams Pages in: poll the status
 * endpoint, render a twinkling dot per Page, refresh the server view when
 * the book leaves `generating`.
 */
export function GenerationProgress({
  storybookId,
  initialPages,
  expectedPageCount,
}: GenerationProgressProps) {
  const router = useRouter();
  const [pages, setPages] = useState<PageStatus[]>(initialPages);

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/storybooks/${storybookId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { status: string; pages: PageStatus[] };
        setPages(data.pages);
        if (data.status !== "generating") {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // transient — keep polling
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [storybookId, router]);

  const slots = Array.from({ length: expectedPageCount }, (_, i) => {
    const page = pages.find((p) => p.index === i);
    return { index: i, status: page?.generationStatus ?? "pending" };
  });
  const done = slots.filter((s) => s.status !== "pending").length;

  return (
    <div className="card" aria-live="polite">
      <p className="eyebrow">Writing &amp; illustrating</p>
      <h2>
        {done} of {expectedPageCount} pages tucked in
      </h2>
      <p className="muted">
        Your storybook is being written and painted page by page. This takes a
        few minutes — you can leave and come back; we&apos;ll keep going.
      </p>
      <div className="page-dots">
        {slots.map((slot) => (
          <span
            key={slot.index}
            className={`page-dot ${slot.status}`}
            title={`Page ${slot.index + 1}: ${slot.status}`}
          >
            {slot.index + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
