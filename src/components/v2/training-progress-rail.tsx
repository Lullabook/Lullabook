"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { V2_COLORS, V2_RADIUS, V2_SHADOW } from "@/components/v2/tokens";

interface TrainingPersona {
  id: string;
  displayName: string;
  kind: string;
  createdAt: string;
}

interface TrainingProgressRailProps {
  /** Open on first visit after starting training (?training=1). */
  initiallyOpen?: boolean;
}

const TRAINING_MS = 5 * 60 * 1000;

function estimateProgress(createdAt: string): number {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  return Math.min(92, Math.round((elapsed / TRAINING_MS) * 100));
}

export function TrainingProgressRail({ initiallyOpen = false }: TrainingProgressRailProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const [training, setTraining] = useState<TrainingPersona[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/family/training");
        if (!res.ok) return;
        const data = (await res.json()) as { training: TrainingPersona[] };
        if (cancelled) return;
        setTraining(data.training);
        if (data.training.length > 0) setOpen(true);
      } catch {
        /* ignore transient network errors */
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!open || training.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 150,
        width: "min(320px, calc(100vw - 40px))",
        background: V2_COLORS.surface,
        border: `1px solid ${V2_COLORS.border}`,
        borderRadius: V2_RADIUS.card,
        padding: 18,
        boxShadow: V2_SHADOW.composerCard,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <p
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              fontSize: "0.7rem",
              fontWeight: 800,
              color: V2_COLORS.primaryLight,
              margin: "0 0 4px",
            }}
          >
            Still training
          </p>
          <p style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, color: V2_COLORS.text }}>
            {training.length === 1
              ? training[0]!.displayName
              : `${training.length} family members`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss training panel"
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            color: V2_COLORS.textMuted,
            cursor: "pointer",
            fontSize: "1.1rem",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      {training.map((p) => {
        const pct = estimateProgress(p.createdAt);
        return (
          <div key={p.id} style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: V2_COLORS.textMuted }}>
              <span>{p.displayName}</span>
              <span>{pct}%</span>
            </div>
            <div
              style={{
                marginTop: 6,
                height: 8,
                borderRadius: 999,
                background: "#EDE7FE",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${V2_COLORS.primaryLight}, ${V2_COLORS.primary})`,
                  transition: "width 1s ease",
                }}
              />
            </div>
          </div>
        );
      })}
      <p style={{ margin: "12px 0 0", fontSize: "0.8rem", color: V2_COLORS.textMuted, lineHeight: 1.45 }}>
        About 5 minutes total.{" "}
        <Link href="/family" style={{ color: V2_COLORS.primary, fontWeight: 700 }}>
          View on Family →
        </Link>
      </p>
    </aside>
  );
}
