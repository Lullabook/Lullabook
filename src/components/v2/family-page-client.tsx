"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AVATAR_GRADIENTS,
  HEADER_GRADIENTS,
  familyMemberStatus,
} from "@/lib/v2-theme";

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
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    border: active ? "2px solid #8B6DF0" : "1px solid #ECE1CE",
                    background: active ? "#F6F1FF" : "#FFFDF9",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: "50%",
                      background: m.avBg,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontFamily: "var(--v2-font-display)",
                      fontWeight: 700,
                      fontSize: "1.3rem",
                    }}
                    aria-hidden="true"
                  >
                    {m.initial}
                  </span>
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
                background: "#FFFDF9",
                border: "1px solid #ECE1CE",
                borderRadius: 26,
                boxShadow: "0 12px 32px rgba(58,40,80,0.08)",
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
                <span
                  style={{
                    width: 78,
                    height: 78,
                    borderRadius: "50%",
                    background: detail.avBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontFamily: "var(--v2-font-display)",
                    fontWeight: 700,
                    fontSize: "2rem",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
                    border: "4px solid rgba(255,255,255,0.55)",
                  }}
                  aria-hidden="true"
                >
                  {detail.initial}
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

                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: "var(--v2-font-display)",
                        fontWeight: 700,
                        fontSize: "1.2rem",
                      }}
                    >
                      📸 How they look
                    </h3>
                    <span
                      style={{
                        fontSize: "0.85rem",
                        color: "#9A8A78",
                        fontWeight: 700,
                      }}
                    >
                      {detail.photoCount > 0
                        ? `${detail.photoCount} photos`
                        : "No photos yet"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
                    }}
                  >
                    {Array.from({ length: Math.max(6, detail.photoCount) }).map(
                      (_, idx) => (
                        <div
                          key={idx}
                          style={{
                            aspectRatio: "1",
                            borderRadius: 14,
                            border: "1px dashed #D8C9B0",
                            background: idx < detail.photoCount ? "#EDE7FE" : "#FFF8EC",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#9A8A78",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                          }}
                        >
                          {idx < detail.photoCount ? "📷" : "＋"}
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div
                  style={{
                    background: "linear-gradient(160deg,#2A2452,#3E2F63)",
                    borderRadius: 20,
                    padding: 22,
                    color: "#FAF4E6",
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
                  <p style={{ margin: "0 0 16px", color: "#C9BDE8", fontSize: "0.92rem" }}>
                    Record a few lines and {babyName} will hear {detail.name} read to
                    them — in their own voice, on every page.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {detail.voiceClips.length === 0 ? (
                      <p
                        style={{
                          margin: 0,
                          fontStyle: "italic",
                          color: "#D7CBEE",
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
                            borderRadius: 14,
                            padding: "12px 14px",
                          }}
                        >
                          <span
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: "50%",
                              background: "linear-gradient(135deg,#F6C177,#E79A3C)",
                              color: "#3a2410",
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
                              <span style={{ fontSize: "0.78rem", color: "#9F92C4" }}>
                                {formatDuration(clip.durationSecs)}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontStyle: "italic",
                                color: "#D7CBEE",
                                fontSize: "0.86rem",
                              }}
                            >
                              &ldquo;{clip.transcript}&rdquo;
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      className="v2-btn"
                      style={{
                        alignSelf: "flex-start",
                        background: "#FAF4E6",
                        color: "#2A2452",
                        padding: "11px 18px",
                        fontSize: "0.9rem",
                      }}
                    >
                      🔴 Record a new message
                    </button>
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