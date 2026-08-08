"use client";

import { useState, useTransition } from "react";
import { acceptLikenessAction } from "@/lib/actions";

interface LikenessConfirmProps {
  personaId: string;
  displayName: string;
}

/** Post-training review: the parent confirms the likeness feels right. */
export function LikenessConfirm({ personaId, displayName }: LikenessConfirmProps) {
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirmed) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          padding: "5px 12px",
          borderRadius: 999,
          background: "#E1F1E8",
          color: "#3C7556",
          fontWeight: 800,
          fontSize: "0.78rem",
        }}
      >
        ✓ Likeness confirmed
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {error && (
        <div
          role="alert"
          style={{ borderRadius: 14, padding: "10px 14px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48", fontSize: "0.85rem" }}
        >
          {error}
        </div>
      )}
      <button
        type="button"
        className="v2-btn v2-btn--ghost-surface"
        style={{ alignSelf: "flex-start", padding: "9px 16px", fontSize: "0.88rem" }}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await acceptLikenessAction(personaId);
            if (!res.ok) return setError(res.error);
            setConfirmed(true);
          });
        }}
      >
        Yes, that&apos;s {displayName} ✓
      </button>
    </div>
  );
}
