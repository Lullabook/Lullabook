# Session Handoff — 2026-06-23: R1 implementation (PRD v14, issues 122-135) → merged

Status: historical

PRD v14 (R1) built, red-teamed (5 bugs, 3 merge-blockers fixed) and merged via PR #82.
Track A: real illustrated-story loop (fal error surfacing, `selectFalAdapter()` flag-only
dev fallback, honest `DEV_DEMO_SEED`, likeness-confirmation gate w/ migration 011,
deterministic R1 smoke). Track B: iOS legal gate (consent fail-closed, entitlement
doesn't flip on purchase failure, `R1_ONE_PLAN` + `GET /api/paywall-config`,
config-driven jurisdiction engine US+IN). Track C: PDF keepsake, moderation fails
closed, hard-delete never subscription-gated, secrets audit + App Review packet.

- Still binding: likeness gate uses `!== true` (legacy rows block); `acceptLikeness`
  Guardian-only; adding a market is config-only + legal-review checklist; moderation
  fails closed; hard-delete always available.

(condensed 2026-07-07 — full text in git history)
