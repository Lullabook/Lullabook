# Session Handoff — 2026-06-23: /part2 Track B — PRD v13 "The whole family" (issues 109–115)

Status: historical

Shipped issues 109–115 (PR #79, ADR-0024): invite token model + email, token-based
`acceptInvite` with onboarding-collision fix, mobile invite/accept UI, 4 Bearer-authed
voice routes over VoiceClipService, family-member detail voice recorder, reader voice
playback, voice-message immediate post + guardian push notify. 382 tests green.
Note: audio and multi-family were later cut from R1 (v16, issues 145–146) — code kept
behind flags for R2.

- Invite token is opaque, distinct from PK, single-use + expiring (7 days); Guardian-only
  mint; role never attacker-chosen; accept is idempotent; cross-family reads throw RLS.
- Voice consent + `narrate` capability gates are server-side (403).
- `FamilyService` / `VoiceClipService` constructors take `NotificationAdapter`.

(condensed 2026-07-07 — full text in git history)
