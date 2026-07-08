# PRD v6 — Journal & Moments (daily capture → personalized stories)

Status: partially restored. R1 originally cut this (PRD v16), then **un-cut** via
ADR-0026 / PRD v19 (Journal + Learning restored, solo/one-Baby only). The heavy
machinery below (Story Context Engine, Firsts, Birthday, weekly suggestion,
photo-to-story) **stays deferred** in R1.

Still-binding model (for when/if the heavy machinery ships):
- **Moment** = dated, parent-logged event about one Baby (text + date + optional
  linked people + `significant` flag). Belongs to exactly one Baby/World.
- **Auto-context layer**: recent Moments auto-inject into the Prompt as background
  context (not a Brief input) — superseded in design by ADR-0022 Story Context Engine
  (PRD v12), which is itself deferred in R1.
- Every auto-story offer (weekly suggestion, Firsts, Birthday) is parent-confirmed —
  **never silent background spend**.
- Moments carry no new biometric data; ride the Baby's existing consent + hard-delete.

(condensed 2026-07-07 — full text in git history)
