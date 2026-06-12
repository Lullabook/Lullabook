"use client";

import { useState, useTransition } from "react";
import { mintShareLinkAction, revokeShareLinkAction } from "@/lib/actions";

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
    <div className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {warning && (
        <div className="alert alert-warning" role="alert">
          {warning}
          {mintedUrl && (
            <p style={{ margin: "8px 0 0" }}>
              Share link: <a href={mintedUrl}>{location.origin + mintedUrl}</a>
            </p>
          )}
        </div>
      )}

      <div className="row">
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
          <label htmlFor="share-expiry">Expires (optional)</label>
          <input
            id="share-expiry"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
          <label htmlFor="share-passcode">Passcode (optional)</label>
          <input
            id="share-passcode"
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="grandma123"
          />
        </div>
      </div>
      <button
        className="btn btn-secondary"
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
        Create share link
      </button>

      {active.length > 0 && (
        <table className="plain">
          <thead>
            <tr>
              <th>Link</th>
              <th>Expiry</th>
              <th>Passcode</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {active.map((link) => (
              <tr key={link.id}>
                <td>
                  <a href={link.url}>{link.url}</a>
                </td>
                <td>{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "Never"}</td>
                <td>{link.hasPasscode ? "Yes" : "No"}</td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
