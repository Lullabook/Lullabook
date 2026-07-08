# PRD v7 — Roster Avatars, Local-Dev Ergonomics & TestFlight Readiness

Status: shipped (ADR-0020).

Still-binding rules:
- **Roster avatar** = the picture shown for any roster member (Baby or adult),
  everywhere in the app — a generated illustration from that member's trained LoRA,
  **never** the raw uploaded photo. Placeholder while `training`/`failed`. Display-only:
  photos still upload, still train likeness (ADR-0001/0002 unchanged).
  Applies to Baby **and** adults, web **and** mobile.
- Local dev: when `BLOB_S3_*` creds are absent and not production, use a local
  disk-backed blob store instead of R2 (mirrors the moderation dev-fallback pattern).
- Two-mode local dev (`dev:free` / `dev:paid`) forces the Subscription state so free
  vs paid can be compared side by side — pattern reused by all later PRDs.

(condensed 2026-07-07 — full text in git history)
