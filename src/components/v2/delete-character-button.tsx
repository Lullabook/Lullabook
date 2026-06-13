"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCharacterAction } from "@/lib/actions";

interface DeleteCharacterButtonProps {
  characterId: string;
  characterName: string;
}

export function DeleteCharacterButton({
  characterId,
  characterName,
}: DeleteCharacterButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCharacterAction(characterId);
      if (res && !res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: "0.82rem", color: "#6E6076", fontWeight: 700 }}>
          Delete {characterName} forever?
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="v2-btn v2-btn--danger"
            style={{ flex: 1, justifyContent: "center", padding: 10, fontSize: "0.85rem" }}
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            className="v2-btn v2-btn--ghost-surface"
            style={{ flex: 1, justifyContent: "center", padding: 10, fontSize: "0.85rem" }}
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Keep
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {error && (
        <span role="alert" style={{ fontSize: "0.8rem", color: "#B23A48", fontWeight: 700 }}>
          {error}
        </span>
      )}
      <button
        type="button"
        className="v2-btn v2-btn--danger-ghost"
        style={{ width: "100%", justifyContent: "center", padding: 10, fontSize: "0.85rem" }}
        onClick={() => setConfirming(true)}
      >
        🗑 Delete character
      </button>
    </div>
  );
}
