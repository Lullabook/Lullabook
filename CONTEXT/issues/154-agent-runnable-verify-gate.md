# 154 — Agent-runnable `verify`: one command, one pass/fail gate

Triage: ready-for-agent

## Parent
PRD v17 — `CONTEXT/planning/prd-v17-test-framework-and-logging.md`. Track T5.

## What to build
A single `npm run verify` that runs the whole suite — unit + integration (Vitest) + web e2e
(Playwright) + the R1 smoke — against the deterministic seed (153), prints a readable summary,
and **exits non-zero on any real failure**. This is the gate an agent loops against instead of
judging "done" by eye. Deterministic (uses `DEV_FAL_FALLBACK`, no live keys); completes in < 5
min locally.

## Acceptance criteria
- [ ] `npm run verify` runs unit + integration + web e2e + smoke and produces a human-readable
      pass/fail summary.
- [ ] **Exits non-zero on any real failure** — no swallowed failures, no skipped-as-passed
      green-washing (asserted by injecting a known failure).
- [ ] Deterministic and < 5 min locally (no live keys; `DEV_FAL_FALLBACK`).
- [ ] Documented as *the* command an agent/contributor runs to know the app is healthy.

## Verification-command
```bash
npm run verify
```

## Blocked by
153
