# 180 — Complete native Likeness confirmation and resume waiting Briefs

Triage: ready-for-agent

> **Coder update 2026-07-24 — TESTS 7/7 PASS; SERVICES IMPLEMENTED.** Training
> completion creates review samples + Roster avatar without Story readiness.
> Authenticated accept boundary with Adult self-consent enforcement. Retraining
> replaces derivatives without exposing source photos. Brief resume exactly-once
> after all Personas ready. No illustration spend before likeness confirmation.
> **Debugger scope:** exactly-once Brief resume is in-memory (not crash-safe);
> native "Retry / retrain" button doesn't call `retrainLikeness()`; derivative
> generation can orphan partial artifacts.

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Turn owned training output into an explicit review lifecycle. Generate safe review samples and the Roster avatar, show them in the native Family flow, let the Guardian or Adult subject accept/retrain as authorized, and advance Story readiness only on Likeness confirmation. A Brief saved during training resumes automatically after the required Personas are accepted.

## Acceptance criteria

- [ ] Training completion creates review samples and a generated Roster avatar but does not make the Persona Story-ready.
- [ ] The native app exposes review, accept, and retry/retrain states and calls the authenticated acceptance boundary.
- [ ] Acceptance is idempotent and authorized; a Guardian handles Baby Personas while the Adult subject’s self-consent boundary is preserved.
- [ ] Rejected/retrained likeness replaces prior derivatives without exposing source photos or orphaning owned artifacts.
- [ ] A waiting Brief resumes exactly once after every selected Persona is ready; provider failure leaves it recoverable and visible.
- [ ] No full Storybook illustration spend occurs before Likeness confirmation.

## Verification-command

```bash
npx vitest run tests/180-likeness-readiness-cold-start.test.ts && npm run verify
```

## Blocked by

- GitHub issue #153 (local ticket 179)
