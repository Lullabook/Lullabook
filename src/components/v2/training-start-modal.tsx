"use client";

import { V2_COLORS, V2_RADIUS, V2_SHADOW } from "@/components/v2/tokens";

interface TrainingStartModalProps {
  open: boolean;
  name: string;
  onDismiss: () => void;
}

/** Full-screen confirmation while photos upload and training is queued. */
export function TrainingStartModal({ open, name, onDismiss }: TrainingStartModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-start-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(46, 36, 56, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: V2_COLORS.surface,
          border: `1px solid ${V2_COLORS.border}`,
          borderRadius: V2_RADIUS.card,
          padding: 28,
          boxShadow: V2_SHADOW.composerCard,
          textAlign: "center",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontSize: "0.74rem",
            fontWeight: 800,
            color: V2_COLORS.primaryLight,
            margin: "0 0 8px",
          }}
        >
          ✨ Training started
        </p>
        <h2
          id="training-start-title"
          style={{
            fontFamily: "var(--v2-font-display)",
            fontWeight: 800,
            fontSize: "1.5rem",
            color: V2_COLORS.text,
            margin: "0 0 10px",
          }}
        >
          {name.trim() || "Your family member"} is on the way
        </h2>
        <p style={{ color: V2_COLORS.textMuted, fontSize: "0.95rem", lineHeight: 1.55, margin: "0 0 20px" }}>
          We&apos;re uploading photos and starting a private likeness model — about
          5 minutes. You can close this and keep browsing; we&apos;ll show progress on
          the Family page.
        </p>
        <div
          aria-hidden="true"
          style={{
            height: 8,
            borderRadius: 999,
            background: "#EDE7FE",
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              height: "100%",
              width: "35%",
              borderRadius: 999,
              background: `linear-gradient(90deg, ${V2_COLORS.primaryLight}, ${V2_COLORS.primary})`,
              animation: "v2-indeterminate 1.4s ease-in-out infinite",
            }}
          />
        </div>
        <button type="button" className="v2-btn v2-btn--primary" onClick={onDismiss}>
          Got it — take me to Family
        </button>
      </div>
    </div>
  );
}
