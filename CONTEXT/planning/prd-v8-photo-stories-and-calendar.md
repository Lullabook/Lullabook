# PRD v8 — Photo Stories, Firsts & Birthday Stories

Status: mostly deferred. R1 cuts Firsts/photo-to-story/weekly-suggestion machinery
(PRD v16); Baby `birthDate` field shipped and is used by later PRDs.

Still-binding rule (ADR-0021, applies if/when this ships):
- **Moment photo** is **write-only** — stored Family-scoped, never rendered on any
  surface (web or mobile). A vision model reads it into a **scene description** that
  seeds the Brief/auto-context; pixels **never** condition art and **never** train
  likeness. Rides the Baby's existing consent (no new gate); hard-deletable.
- Every auto-story offer (Firsts, Birthday, photo-to-story) is parent-confirmed —
  never silent spend.

(condensed 2026-07-07 — full text in git history)
