"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { hardDeleteFamilyAction } from "@/lib/actions";

const inputStyle: CSSProperties = {
  width: "100%",
  fontSize: "1rem",
  color: "#2E2438",
  background: "#FBF4E7",
  border: "1px solid #ECE1CE",
  borderRadius: 14,
  padding: "13px 15px",
  boxSizing: "border-box",
  fontFamily: "var(--v2-font-body)",
};

export function HardDeleteConfirm() {
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const armed = confirmation === "DELETE" && !pending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
      {error && (
        <div
          role="alert"
          style={{ borderRadius: 16, padding: "14px 16px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48", fontSize: "0.92rem" }}
        >
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="delete-confirm"
          style={{ display: "block", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1rem", color: "#2E2438", marginBottom: 6 }}
        >
          Type <strong style={{ color: "#B23A48" }}>DELETE</strong> to confirm
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
          style={inputStyle}
        />
      </div>
      <button
        type="button"
        className="v2-btn v2-btn--danger"
        disabled={!armed}
        style={{ alignSelf: "flex-start", opacity: armed ? 1 : 0.55, cursor: armed ? "pointer" : "not-allowed" }}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await hardDeleteFamilyAction(confirmation);
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Deleting everything…" : "Delete my family forever"}
      </button>
    </div>
  );
}
