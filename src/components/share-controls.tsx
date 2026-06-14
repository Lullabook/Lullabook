"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { mintShareLinkAction, revokeShareLinkAction } from "@/lib/actions";

const fieldLabel: CSSProperties = {
  display: "block",
  fontFamily: "var(--v2-font-display)",
  fontWeight: 700,
  fontSize: "0.95rem",
  color: "#2E2438",
  marginBottom: 6,
};
const fieldInput: CSSProperties = {
  width: "100%",
  fontFamily: "var(--v2-font-body)",
  fontSize: "1rem",
  color: "#2E2438",
  background: "#FBF4E7",
  border: "1px solid #ECE1CE",
  borderRadius: 14,
  padding: "12px 14px",
  boxSizing: "border-box",
};
const noticeBase: CSSProperties = {
  borderRadius: 16,
  padding: "14px 16px",
  fontSize: "0.92rem",
  border: "1px solid",
};

export interface ShareLinkView {
  id: string;
  url: string;
  expiresAt: string | null;
  hasPasscode: boolean;
  revoked: boolean;
}

interface ShareControlsProps {
  storybookId: string;
  links: ShareLinkView[];
}

export function ShareControls({ storybookId, links }: ShareControlsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [passcode, setPasscode] = useState("");

  const active = links.filter((l) => !l.revoked);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div role="alert" style={{ ...noticeBase, background: "#fdf1f3", borderColor: "#eccdd2", color: "#b23a48" }}>
          {error}
        </div>
      )}
      {warning && (
        <div role="alert" style={{ ...noticeBase, background: "#FBEBCE", borderColor: "#f0d9ad", color: "#9a6b1e" }}>
          {warning}
          {mintedUrl && (
            <p style={{ margin: "8px 0 0" }}>
              Share link: <a href={mintedUrl} style={{ color: "#6A55C9", fontWeight: 700 }}>{location.origin + mintedUrl}</a>
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="share-expiry" style={fieldLabel}>Expires (optional)</label>
          <input
            id="share-expiry"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={fieldInput}
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="share-passcode" style={fieldLabel}>Passcode (optional)</label>
          <input
            id="share-passcode"
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="grandma123"
            style={fieldInput}
          />
        </div>
      </div>
      <button
        type="button"
        className="v2-btn v2-btn--ghost-surface"
        style={{ alignSelf: "flex-start" }}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await mintShareLinkAction(storybookId, {
              expiresAt: expiresAt || undefined,
              passcode: passcode || undefined,
            });
            if (!res.ok) return setError(res.error);
            setWarning(res.data.warning);
            setMintedUrl(res.data.url);
          });
        }}
      >
        🔗 Create share link
      </button>

      {active.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {active.map((link) => (
            <div
              key={link.id}
              style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 16, border: "1px solid #ECE1CE", background: "#FBF4E7" }}
            >
              <a href={link.url} style={{ flex: 1, minWidth: 160, color: "#6A55C9", fontWeight: 700, fontSize: "0.9rem", wordBreak: "break-all" }}>
                {link.url}
              </a>
              <span style={{ fontSize: "0.82rem", color: "#9A8A78", fontWeight: 700 }}>
                {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}` : "Never expires"}
                {link.hasPasscode ? " · 🔒 passcode" : ""}
              </span>
              <button
                type="button"
                className="v2-btn v2-btn--danger-ghost"
                style={{ padding: "7px 14px", fontSize: "0.82rem" }}
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await revokeShareLinkAction(link.id, storybookId);
                    if (!res.ok) setError(res.error);
                  });
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
