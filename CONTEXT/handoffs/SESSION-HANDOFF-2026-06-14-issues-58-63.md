# Session Handoff — 2026-06-14: Issues 58–63 (Roster Avatars + local dev + TestFlight runbook)

Status: historical

Shipped issues 58–62 plus the issue-63 TestFlight runbook (`mobile/TESTFLIGHT-RUNBOOK.md`,
human-executed): `avatarKey` on Persona with roster portrait generated on `ready`,
`/api/avatars`, `RosterAvatar` UI on web + mobile, `replacePhotos()` retrain→regenerate,
`dev:free` (:3000) / `dev:paid` (:3001) via `DEV_FORCE_SUBSCRIPTION`. Migration
`supabase/migrations/008_avatar_key.sql`.

- Binding (ADR-0020): raw photos never rendered on any display surface — roster avatar is generated from LoRA, neutral placeholder while training/failed.
- Binding: replacing reference photos retrains the LoRA and regenerates the avatar.

(condensed 2026-07-07 — full text in git history)
