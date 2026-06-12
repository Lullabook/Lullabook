"use client";

import { useState, useTransition } from "react";
import { hardDeleteFamilyAction } from "@/lib/actions";

export function HardDeleteConfirm() {
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="delete-confirm">
          Type <strong>DELETE</strong> to confirm
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
        />
      </div>
      <button
        className="btn btn-danger"
        disabled={pending || confirmation !== "DELETE"}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await hardDeleteFamilyAction(confirmation);
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Deleting everything…" : "Delete my Family forever"}
      </button>
    </div>
  );
}
