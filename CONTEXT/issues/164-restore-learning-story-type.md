# 164 — Restore the Learning story type (un-cut)

Status: shipped

Per ADR-0026: un-cut the existing `learning` story type. `EXPO_PUBLIC_R1_STORY_TYPES_ENABLED=true`
set in mobile env so `isR1MultiStoryTypeEnabled()` returns `ALL_STORY_TYPES`; server gate in
`src/lib/r1-config.ts` agrees. Placeholder `🌟` replaced with a role-correct symbol distinct
from Bedtime's `🌙` (coordinated with 166). Learning Briefs generate via 162's placeholder-art
path. Binding: mobile flag + server gate must always agree.

(condensed 2026-07-07 — full spec in git history)
