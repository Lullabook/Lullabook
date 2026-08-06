# 209 — Confirm five likenesses and resume a waiting Brief exactly once across restarts

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Turn owned training output into the review lifecycle for all five Personas, and fix the crash-safety gap left open in local issue 180: exactly-once Brief resume is currently in-memory, the native retrain button does not call `retrainLikeness()`, and derivative generation can orphan artifacts.

## Acceptance criteria

- [ ] Training completion creates review samples and a generated Roster avatar, and does not by itself make a Persona Story-ready.
- [ ] The native app exposes review, accept, and retrain states, and the retrain control actually invokes `retrainLikeness()`.
- [ ] Acceptance is idempotent and authorized: a Guardian accepts each minor's Persona, and each adult subject's own self-consent boundary is preserved (`SEC-3`).
- [ ] A Brief saved during training resumes exactly once after all five Personas are confirmed, and resumes exactly once when the process is restarted mid-wait (`FAIL-8`).
- [ ] Retraining replaces prior derivatives without exposing a source photo and without orphaning an owned artifact (`SEC-7`).
- [ ] No Storybook illustration spend occurs before every selected Persona's likeness is confirmed (`COST-1`).

## Verification-command

```bash
npx vitest run tests/209-likeness-confirmation-resume.test.ts && npm run verify
```

## Blocked by

208

## Invariants restated

FAIL-8, SEC-3, SEC-7, COST-1

## Notes

Crash-safe resume means the exactly-once marker is persisted in the database, not held in process memory.

**Target backend:** Vercel.
