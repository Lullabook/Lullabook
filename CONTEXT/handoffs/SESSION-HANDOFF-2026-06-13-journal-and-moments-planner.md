# Session handoff — 2026-06-13 — Journal & Moments `/planner` (plan only)

Status: historical

Planned the Journal & Moments feature (PRD v6 + ADR-0019 + glossary + issues
50–56), dropped in the Maya's World v2 / Daily-Life UI shells (web + mobile), and
landed Cursor's part-2 implementation of issues 50–56 (migration 007, moment /
moment-week / auto-context / journal-nudge services, World nudge + weekly-story
cards; 192 tests green).

- Binding: a Moment = free text + date + optional linked people + a single `significant ✨` boolean (no Milestone entity, no score); one Journal per Baby.
- Binding: personalization is the auto-context layer (ADR-0019), not a Brief input — every Significant Moment + ordinary Moments since the Baby's last Story; the per-Baby watermark advances only on successful generation.
- Binding: weekly story = suggestion + one-tap with confirm-before-spend — never silent background generation; capture is always free-form and never forced.
- Binding: Moments carry no new biometric data — they ride the Baby's existing consent + hard-delete/purge (ADR-0007), no new consent gate.

(condensed 2026-07-07 — full text in git history)
