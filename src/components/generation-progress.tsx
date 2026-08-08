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
    <div
      aria-live="polite"
      style={{
        background: "#FFFDF9",
        border: "1px solid #ECE1CE",
        borderRadius: 22,
        padding: 22,
        boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
      }}
    >
      <p style={{ textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.74rem", fontWeight: 800, color: "#8B6DF0", margin: "0 0 6px" }}>
        ✨ Writing &amp; illustrating
      </p>
      <h2 style={{ margin: "0 0 6px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.4rem", color: "#2E2438" }}>
        {done} of {expectedPageCount} pages tucked in
      </h2>
      <p style={{ margin: "0 0 16px", color: "#6E6076", fontSize: "0.95rem", lineHeight: 1.5 }}>
        Your storybook is being written and painted page by page. This takes a
        few minutes — you can leave and come back; we&apos;ll keep going.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {slots.map((slot) => {
          const ready = slot.status === "ready";
          const failed = slot.status === "failed" || slot.status === "quarantined";
          const pendingDot = slot.status === "pending";
          return (
            <span
              key={slot.index}
              title={`Page ${slot.index + 1}: ${slot.status}`}
              style={{
                width: 34,
                height: 44,
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.74rem",
                fontWeight: 800,
                border: `1px solid ${ready ? "#5FB389" : failed ? "#F2A6B8" : "#ECE1CE"}`,
                background: ready ? "#E1F1E8" : failed ? "#FDF1F3" : "#FBF4E7",
                color: ready ? "#3C7556" : failed ? "#B23A48" : "#9A8A78",
                animation: pendingDot ? "v2-twinkle 1.8s ease-in-out infinite" : undefined,
              }}
            >
              {slot.index + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}
