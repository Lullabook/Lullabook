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

  return (
    <form action={formAction} className="stack">
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={showJurisdiction ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </div>
      {showJurisdiction && (
        <div className="field">
          <label htmlFor="jurisdiction">Where do you live?</label>
          <select id="jurisdiction" name="jurisdiction" defaultValue="US">
            {JURISDICTIONS.map((j) => (
              <option key={j.code} value={j.code}>
                {j.label}
              </option>
            ))}
          </select>
          <span className="hint">
            Consent and privacy rules adapt to your jurisdiction.
          </span>
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "One moment…" : submitLabel}
      </button>
    </form>
  );
}
