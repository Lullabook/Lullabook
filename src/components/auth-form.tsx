"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions";

interface AuthFormProps {
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  showJurisdiction?: boolean;
}

const JURISDICTIONS = [
  { code: "US", label: "United States" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "SG", label: "Singapore" },
  { code: "IN", label: "India" },
];

export function AuthForm({ action, submitLabel, showJurisdiction }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null
  );

  const labelStyle: React.CSSProperties = { fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438", fontSize: "0.95rem" };
  const inputStyle: React.CSSProperties = { width: "100%", fontFamily: "var(--v2-font-body)", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px", boxSizing: "border-box" };

  return (
    <form action={formAction} className="v2-stack" style={{ gap: 16, fontFamily: "var(--v2-font-body)" }}>
      {state && !state.ok && (
        <div role="alert" style={{ borderRadius: 16, padding: "14px 16px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48", fontSize: "0.92rem" }}>
          {state.error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" style={labelStyle}>Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required style={inputStyle} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="password" style={labelStyle}>Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={showJurisdiction ? "new-password" : "current-password"}
          minLength={8}
          required
          style={inputStyle}
        />
      </div>
      {showJurisdiction && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="jurisdiction" style={labelStyle}>Where do you live?</label>
          <select id="jurisdiction" name="jurisdiction" defaultValue="US" style={inputStyle}>
            {JURISDICTIONS.map((j) => (
              <option key={j.code} value={j.code}>
                {j.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: "0.82rem", color: "#9A8A78" }}>
            Consent and privacy rules adapt to your jurisdiction.
          </span>
        </div>
      )}
      <button className="v2-btn v2-btn--primary" type="submit" disabled={pending}>
        {pending ? "One moment…" : submitLabel}
      </button>
    </form>
  );
}
