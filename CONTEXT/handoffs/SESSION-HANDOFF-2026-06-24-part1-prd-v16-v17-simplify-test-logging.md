# Session Handoff — /part1: PRD v16 (ruthless cut) + PRD v17 (test framework + logging)

Status: historical

Planning-only (2026-06-24): PRD v16 (ruthless R1 cut → issues 145–149) and PRD v17
(test framework + honest seed + error capture → issues 150–155), plus
`r1-simplify-test-logging-invariants.md` and glossary updates.

- Still binding: deferred = inert-not-broken (server gate, clean 404/403, never 500,
  no reachable dead UI); R1 = solo Guardian, one baby, solo plan(s), US-only R1.0.
- Still binding: logging vendor = Sentry (EU/Frankfurt), fails OPEN, never captures
  child photos/LoRA/PII/tokens (scrubbing tested; `sendDefaultPii:false`); `npm run
  verify` exits non-zero on any real failure; seed deterministic + inert in prod.

(condensed 2026-07-07 — full text in git history)
