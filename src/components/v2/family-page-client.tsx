"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { RosterAvatar } from "@/components/v2/roster-avatar";
import { replacePersonaPhotosAction } from "@/lib/actions";
import {
  AVATAR_GRADIENTS,
  HEADER_GRADIENTS,
  familyMemberStatus,
} from "@/lib/v2-theme";
import { V2_COLORS, V2_GRADIENT, V2_RADIUS, V2_SHADOW } from "@/components/v2/tokens";

export interface FamilyMemberViewData {
  id: string;
  name: string;
  relationship: string;
  babyCalls: string;
  theyCallBaby: string;
  initial: string;
  avBg: string;
  headerBg: string;
  photoCount: number;
  personaStatus: "training" | "ready" | "failed";
  avatarKey: string | null;
  kind: "baby" | "adult";
  voiceClips: { label: string; durationSecs: number; transcript: string }[];
}

interface FamilyPageClientProps {
  babyName: string;
  members: FamilyMemberViewData[];
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Decorative 28-bar waveform (visual spec §2D). Heights are deterministic. */
function Waveform({ seed }: { seed: string }) {
  const bars = Array.from({ length: 28 }, (_, i) => {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    return 4 + (code % 19); // 4–22px
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 22, margin: "2px 0" }} aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            background: V2_COLORS.waveformBar,
          }}
        />
      ))}
    </div>
  );
}

export function FamilyPageClient({ babyName, members }: FamilyPageClientProps) {
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? "");

  const detail = members.find((m) => m.id === selectedId) ?? members[0];

  return (
    <div className="v2-stack" style={{ gap: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p className="v2-eyebrow">💛 {babyName}&apos;s family</p>
          <h1 className="v2-page-title">The people in their world</h1>
          <p className="v2-page-lead" style={{ maxWidth: 560 }}>
            Real people who love {babyName}. Add their photos and their voice, and
            they&apos;ll look and sound like themselves in every story.
          </p>
        </div>
        <Link className="v2-btn v2-btn--primary" href="/personas/new">
          ＋ Add family member
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="v2-empty">
          <span className="v2-empty__icon" aria-hidden="true">
            💛
          </span>
          <h2 className="v2-section-title">No family members yet</h2>
          <p className="v2-page-lead" style={{ marginBottom: 20 }}>
            Add the people who love {babyName} so they can star in illustrated
            stories.
          </p>
          <Link className="v2-btn v2-btn--primary" href="/personas/new">
            ＋ Add family member
          </Link>
        </div>
      ) : (
        <div className="v2-family-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {members.map((m) => {
              const meta = familyMemberStatus(m.personaStatus, m.photoCount);
              const active = m.id === detail?.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "13px 14px",
                    borderRadius: V2_RADIUS.row,
                    border: `1.5px solid ${active ? V2_COLORS.primaryLight : V2_COLORS.border}`,
                    background: active ? V2_COLORS.hoverTint : V2_COLORS.surface,
                    boxShadow: active ? V2_SHADOW.familyRowActive : V2_SHADOW.familyRow,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <RosterAvatar
                    name={m.name}
                    initial={m.initial}
                    avBg={m.avBg}
                    status={m.personaStatus}
                    avatarKey={m.avatarKey}
                    size={50}
                  />
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      flex: 1,
                      lineHeight: 1.2,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--v2-font-display)",
                        fontWeight: 700,
                        fontSize: "1.1rem",
                        color: "#2E2438",
                      }}
                    >
                      {m.name}
                    </span>
                    <span
                      style={{
                        fontSize: "0.82rem",
                        color: "#9A8A78",
                        fontWeight: 700,
                      }}
                    >
                      {m.relationship} · calls them &ldquo;{m.babyCalls}&rdquo;
                    </span>
                  </span>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: meta.dot,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
            <Link
              href="/personas/new"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: 18,
                border: "2px dashed #D8C9B0",
                background: "#FFF8EC",
                color: "#9A8A78",
                fontWeight: 800,
                fontSize: "0.95rem",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.4rem",
                  boxShadow: "0 4px 12px rgba(58,40,80,0.1)",
                }}
                aria-hidden="true"
              >
                ＋
              </span>
              Add someone who loves {babyName}
            </Link>
          </div>

          {detail && (
            <div
              style={{
                background: V2_COLORS.surface,
                border: `1px solid ${V2_COLORS.border}`,
                borderRadius: V2_RADIUS.detail,
                boxShadow: V2_SHADOW.familyDetail,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  padding: 26,
                  background: detail.headerBg,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                }}
              >
                <span style={{ boxShadow: "0 8px 20px rgba(58,40,80,0.18)", borderRadius: "50%", border: "4px solid rgba(255,255,255,0.55)" }}>
                <RosterAvatar
                  name={detail.name}
                  initial={detail.initial}
                  avBg={detail.avBg}
                  status={detail.personaStatus}
                  avatarKey={detail.avatarKey}
                  size={78}
                />
                </span>
                <div style={{ flex: 1 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "var(--v2-font-display)",
                      fontWeight: 800,
                      fontSize: "1.7rem",
                      color: "#fff",
                    }}
                  >
                    {detail.name}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 8,
                    }}
                  >
                    <span
                      style={{
                        padding: "5px 12px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.25)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: "0.8rem",
                      }}
                    >
                      {detail.relationship} to {babyName}
                    </span>
                    <span
                      style={{
                        padding: "5px 12px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.95)",
                        color: "#3a2410",
                        fontWeight: 800,
                        fontSize: "0.8rem",
                      }}
                    >
                      {familyMemberStatus(detail.personaStatus, detail.photoCount).label}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <div
                    style={{
                      background: "#FBF4E7",
                      border: "1px solid #F0E6D2",
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: "0.72rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        fontWeight: 800,
                        color: "#9A8A78",
                      }}
                    >
                      What {babyName} calls them
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "var(--v2-font-display)",
                        fontWeight: 700,
                        fontSize: "1.4rem",
                        color: "#6A55C9",
                      }}
                    >
                      &ldquo;{detail.babyCalls}&rdquo;
                    </p>
                  </div>
                  <div
                    style={{
                      background: "#FBF4E7",
                      border: "1px solid #F0E6D2",
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: "0.72rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        fontWeight: 800,
                        color: "#9A8A78",
                      }}
                    >
                      What they call {babyName}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "var(--v2-font-display)",
                        fontWeight: 700,
                        fontSize: "1.4rem",
                        color: "#E79A3C",
                      }}
                    >
                      &ldquo;{detail.theyCallBaby}&rdquo;
                    </p>
                  </div>
                </div>

                <UpdateReferencePhotos
                  personaId={detail.id}
                  photoCount={detail.photoCount}
                  personaStatus={detail.personaStatus}
                  kind={detail.kind}
                />

                <div
                  style={{
                    background: V2_GRADIENT.voicePanel,
                    borderRadius: V2_RADIUS.voicePanel,
                    padding: 22,
                    color: V2_COLORS.voiceCream,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: "var(--v2-font-display)",
                        fontWeight: 700,
                        fontSize: "1.25rem",
                        color: "#fff",
                      }}
                    >
                      🎙️ Their real voice
                    </h3>
                    <span className="v2-badge-illustrated">✨ Illustrated plan</span>
                  </div>
                  <p style={{ margin: "0 0 16px", color: V2_COLORS.voiceMuted, fontSize: "0.92rem" }}>
                    Record a few lines and {babyName} will hear {detail.name} read to
                    them — in their own voice, on every page.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {detail.voiceClips.length === 0 ? (
                      <p
                        style={{
                          margin: 0,
                          fontStyle: "italic",
                          color: V2_COLORS.voiceQuote,
                          fontSize: "0.9rem",
                        }}
                      >
                        No voice clips recorded yet.
                      </p>
                    ) : (
                      detail.voiceClips.map((clip) => (
                        <div
                          key={clip.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: V2_RADIUS.audio,
                            padding: "12px 14px",
                          }}
                        >
                          <span
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: "50%",
                              background: V2_GRADIENT.ctaAmber,
                              color: V2_COLORS.accentDarkText,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "1rem",
                              flexShrink: 0,
                            }}
                            aria-hidden="true"
                          >
                            ▶
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 6,
                              }}
                            >
                              <span style={{ fontWeight: 800, fontSize: "0.92rem", color: "#fff" }}>
                                {clip.label}
                              </span>
                              <span style={{ fontSize: "0.78rem", color: V2_COLORS.voiceDuration }}>
                                {formatDuration(clip.durationSecs)}
                              </span>
                            </div>
                            <Waveform seed={clip.label} />
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontStyle: "italic",
                                color: V2_COLORS.voiceQuote,
                                fontSize: "0.86rem",
                              }}
                            >
                              &ldquo;{clip.transcript}&rdquo;
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <span
                      style={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        background: V2_COLORS.voiceCream,
                        color: V2_COLORS.nightPanel,
                        padding: "11px 18px",
                        borderRadius: V2_RADIUS.pill,
                        fontSize: "0.9rem",
                        fontWeight: 800,
                      }}
                      title="Voice recording is coming soon"
                    >
                      🔴 Record a new message
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: "#6E6076", fontSize: "0.9rem" }}>
                    {detail.photoCount > 0 && detail.voiceClips.length > 0
                      ? "Ready to star in illustrated stories."
                      : "Add photos and voice to unlock illustrated stories."}
                  </span>
                  <Link className="v2-btn v2-btn--primary" href="/storybooks/new">
                    ✨ Cast in a story
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UpdateReferencePhotos({
  personaId,
  photoCount,
  personaStatus,
  kind,
}: {
  personaId: string;
  photoCount: number;
  personaStatus: "training" | "ready" | "failed";
  kind: "baby" | "adult";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsSelfie, setNeedsSelfie] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  function submit(files: File[], selfie: File | null) {
    setError(null);
    const fd = new FormData();
    fd.set("personaId", personaId);
    for (const f of files) fd.append("photos", f);
    if (selfie) fd.set("selfie", selfie);
    startTransition(async () => {
      const res = await replacePersonaPhotosAction(fd);
      if (!res.ok) setError(res.error);
    });
  }

  function onFilesPicked(files: File[]) {
    if (files.length < 3) {
      setError("Pick at least 3 photos");
      return;
    }
    if (kind === "adult") {
      setQueuedFiles(files);
      setNeedsSelfie(true);
      return;
    }
    submit(files, null);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.2rem" }}>
          📸 Reference photos
        </h3>
        <span style={{ fontSize: "0.85rem", color: "#6E6076", fontWeight: 700 }}>
          {photoCount > 0 ? `${photoCount} photos on file · Replace` : "No photos yet"}
        </span>
      </div>
      {personaStatus === "training" ? (
        <p style={{ margin: "0 0 12px", color: "#6E6076", fontSize: "0.9rem" }}>
          Likeness training in progress — your roster avatar will update when ready.
        </p>
      ) : null}
      {error ? <p style={{ color: "#B23A48", fontSize: "0.88rem" }}>{error}</p> : null}
      <label
        htmlFor={`replace-photos-${personaId}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "24px 20px",
          borderRadius: 18,
          border: `2px dashed ${V2_COLORS.borderDashed}`,
          background: V2_COLORS.surfaceAlt,
          cursor: pending ? "wait" : "pointer",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: "1.5rem" }} aria-hidden="true">⬆️</span>
        <span style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: V2_COLORS.primary }}>
          {pending ? "Uploading…" : "Replace reference photos"}
        </span>
        <span style={{ fontSize: "0.82rem", color: "#6E6076" }}>
          Raw photos are never shown — only the generated roster avatar appears.
        </span>
        <input
          ref={inputRef}
          id={`replace-photos-${personaId}`}
          type="file"
          accept="image/*"
          multiple
          disabled={pending}
          style={{ display: "none" }}
          onChange={(e) => {
            onFilesPicked([...(e.target.files ?? [])]);
          }}
        />
      </label>
      {needsSelfie ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, color: "#6E6076", fontSize: "0.88rem" }}>
            {queuedFiles.length} new photos selected — add a fresh selfie to confirm consent.
          </p>
          <input ref={selfieRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} />
          <button
            type="button"
            className="v2-btn v2-btn--secondary"
            disabled={pending}
            onClick={() => selfieRef.current?.click()}
          >
            🤳 Take selfie
          </button>
          <button
            type="button"
            className="v2-btn v2-btn--primary"
            disabled={pending}
            onClick={() => {
              const selfie = selfieRef.current?.files?.[0] ?? null;
              if (!selfie) {
                setError("Selfie required");
                return;
              }
              submit(queuedFiles, selfie);
            }}
          >
            Start retraining
          </button>
        </div>
      ) : null}
    </div>
  );
}