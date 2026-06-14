"use client";

import { V2_COLORS, V2_RADIUS, V2_SHADOW } from "@/components/v2/tokens";

interface StoryGenerationOverlayProps {
  open: boolean;
  mode: "text" | "illustrated" | "audio";
  onDismiss?: () => void;
}

const COPY = {
  text: {
    eyebrow: "✏️ Writing your story",
    title: "Creating tonight's story",
    lead: "We're weaving words starring your cast. Ready in seconds — you can leave this open or browse away.",
  },
  illustrated: {
    eyebrow: "✨ Writing & illustrating",
    title: "Creating your storybook",
    lead: "We're writing and painting page by page — about 4 minutes. You can close this; progress saves on your shelf.",
  },
  audio: {
    eyebrow: "🎙️ Adding voice",
    title: "Preparing audio",
    lead: "Voice layers are being prepared. Record clips anytime from Family or Account.",
  },
} as const;

export function StoryGenerationOverlay({ open, mode, onDismiss }: StoryGenerationOverlayProps) {
  if (!open) return null;
  const c = COPY[mode];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-gen-title"
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
          maxWidth: 440,
          background: V2_COLORS.surface,
          border: `1px solid ${V2_COLORS.border}`,
          borderRadius: V2_RADIUS.card,
          padding: 28,
          boxShadow: V2_SHADOW.composerCard,
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
          {c.eyebrow}
        </p>
        <h2
          id="story-gen-title"
          style={{
            fontFamily: "var(--v2-font-display)",
            fontWeight: 800,
            fontSize: "1.5rem",
            color: V2_COLORS.text,
            margin: "0 0 10px",
          }}
        >
          {c.title}
        </h2>
        <p style={{ color: V2_COLORS.textMuted, fontSize: "0.95rem", lineHeight: 1.55, margin: "0 0 18px" }}>
          {c.lead}
        </p>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: "#EDE7FE",
            overflow: "hidden",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              height: "100%",
              width: mode === "text" ? "55%" : "28%",
              borderRadius: 999,
              background: `linear-gradient(90deg, ${V2_COLORS.primaryLight}, ${V2_COLORS.primary})`,
              animation: "v2-indeterminate 1.6s ease-in-out infinite",
            }}
          />
        </div>
        {onDismiss && (
          <button type="button" className="v2-btn v2-btn--ghost-surface" onClick={onDismiss}>
            Continue browsing
          </button>
        )}
      </div>
    </div>
  );
}
