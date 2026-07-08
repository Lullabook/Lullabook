# 133 — Moderation fails CLOSED on the shipping path
Status: shipped
Safety moderation on the shipping path: CSAM hash-match + safety classifier on uploaded photos, image moderation on generated outputs, moderation of the free-text Brief note.
Invariant (binding, security-critical): if any moderation service is unavailable → **block, never allow** silently. No child likeness is generated from a photo that failed safety.
(condensed 2026-07-07 — full spec in git history)
