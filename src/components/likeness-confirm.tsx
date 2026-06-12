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
    return <span className="badge badge-ready">Likeness confirmed</span>;
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <button
        className="btn btn-secondary btn-sm"
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
