# 15 — Durable generation spine (single-Persona, real seams)

Status: shipped
Real durable-workflow generation: one structured Claude pass produces Story + per-Page Scenes + Style Bible, persisted to Postgres before fan-out reads it. Per Page: sync fal.ai inference → fetch bytes → moderate BEFORE any persist → store into the Family-scoped R2 `BlobStore`; the Page records the blob key, never the fal URL. Book flips `generating → draft` once every Page is terminal, `→ failed` on no-Story/below-floor. Gated on active subscription + ready Persona + re-roll budget. This is the current generation architecture — still binding.
(condensed 2026-07-07 — full spec in git history)
