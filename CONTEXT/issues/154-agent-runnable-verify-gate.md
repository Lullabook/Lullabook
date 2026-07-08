# 154 — Agent-runnable `verify`: one command, one pass/fail gate

Status: shipped

`npm run verify` (`scripts/verify.mjs`) runs unit + integration (Vitest) + web e2e (Playwright)
+ R1 smoke against the 153 seed, prints a readable summary, exits non-zero on any real failure
(no swallowed/skipped-as-passed). Deterministic (`DEV_FAL_FALLBACK`, no live keys), <5 min
locally. Binding convention: `npm run verify` is *the* health-check command; issues 160-167 all
gate on it.

(condensed 2026-07-07 — full spec in git history)
