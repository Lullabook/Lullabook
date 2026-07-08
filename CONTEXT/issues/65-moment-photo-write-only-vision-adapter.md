# 65 — Moment photo (write-only) + vision→text adapter
Status: cut
Implemented ADR-0021: a Moment may carry an optional photo, stored Family-scoped and never rendered on any view/UI; a vision→text provider port derives a short scene description that's persisted and usable as prompt context (feeds issue 66). "Photo-to-story" was explicitly named in the R1 ruthless-cut defer list (issue 148) and gated off for R1 — the write-only/never-rendered invariant still binds if/when re-enabled.
(condensed 2026-07-07 — full spec in git history)
