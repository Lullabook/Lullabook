# Session Handoff — 2026-06-23: /coder Track A — PRD v13 "It actually works" (issues 100–108)

Status: historical

Shipped issues 100–108 (PR #78): generation terminal-state backstop moved into
`StorybookService` (holds on every adapter) + `reapStrandedGenerations` watchdog; reader
failed/timed-out states; text-viewable draft fallback; nested stack-in-tab nav (kill
Redirect shims); BackPill back affordance; billing modal; dev seed route; camera-free
Simulator upload path. 367 tests green.

- Generation always reaches terminal state on every adapter; watchdog never downgrades
  terminal books; text pages ≥ floor → readable `draft`, not `failed`.
- Dev paths (`DEV_DEMO_SEED`, liveness bypass, fal fallback) double-gated
  (`NODE_ENV !== "production"` AND flag), prod-inert — tested.
- Use free-use/synthetic faces, never real celebrities, for the dev seed.

(condensed 2026-07-07 — full text in git history)
