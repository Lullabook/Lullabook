# 160 — Finalize a Storybook: server route + reader CTA with confirm

Status: shipped

Exposed `StorybookService.finalize` (draft→finalized, one-way) end-to-end:
`POST /api/storybooks/[id]/finalize` (401 unauthed, 400 not 500 on non-draft); `finalizeStorybook(id)`
in `mobile/lib/api.ts`; reader CTA "Finalize keepsake" shown only on `draft`, confirm sheet names
the re-roll lock (invariant E4) first. Confirm → client refetches, never sets `finalized`
locally; failure leaves draft untouched with retryable error. Canon styling (tokens, emoji icon,
Baloo 2/Nunito, radius ≥12).

(condensed 2026-07-07 — full spec in git history)
