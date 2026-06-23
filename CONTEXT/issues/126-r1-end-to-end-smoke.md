# 126 — R1 end-to-end smoke (the tracer bullet: sign-in → story → PDF)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track A.

## What to build
An automated end-to-end smoke proving the full R1 loop against local dev (with
`DEV_FAL_FALLBACK`): sign in → seed/create baby + family → generate a Bedtime book → assert an
**illustrated `draft`** → **export a PDF**. This is the R1 done-signal.

## Acceptance criteria
- [ ] e2e runs the full path and asserts: authenticated, baby + family present, book reaches
      illustrated `draft` (≥1 image), PDF export produces a non-empty file.
- [ ] Deterministic in CI (uses `DEV_FAL_FALLBACK`; no live keys required).
- [ ] Track-A invariants asserted (terminal state within watchdog; detail payload < 500KB).

## Verification-command
```bash
npm run test:e2e -- r1-smoke
```

## Blocked by
124, 125, 132
