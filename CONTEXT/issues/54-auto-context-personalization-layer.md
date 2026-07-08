# 54 — Auto-context personalization layer (ADR-0019)
Status: superseded by 89-story-context-engine-core.md
Implemented ADR-0019: inject a Baby's Significant + since-last-Story Moments into the Prompt as background context (distinct from the Brief), with a per-Baby watermark (advances only on successful generation) and a newest-N/token cap favoring significant Moments. Issue 89 (PRD v12) explicitly generalized/subsumed this into the full Story Context Engine, which was itself later deferred/gated off for R1 (issue 148).
(condensed 2026-07-07 — full spec in git history)
