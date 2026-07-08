# 86 — HITL: Storybook generate & reader (real pipeline)

Status: shipped (assumed — see git history)

Manual HITL smoke slice (PRD v10) verifying the real Anthropic + fal.ai LoRA pipeline
end-to-end on Simulator: generate reaches `draft` within 5min, each reader page loads
text+illustration within 30s, re-roll updates a Page in place, a failed generation stays
re-rollable (not a dead end), and the lullaby clip (issue 73) lands on the final page.
Invariant carried forward: reader shows generated illustrations only, never a raw
uploaded photo (ADR-0020).
Underlying features (issues 78/79/73) shipped independently; this doc's own PASS/FAIL
rows in `HITL-SMOKE-RUNBOOK.md` §4 were left blank, so the manual sweep itself is unconfirmed.

(condensed 2026-07-07 — full spec in git history)
