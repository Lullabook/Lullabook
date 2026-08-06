# 212 — Prove the whole demo end to end in the iOS Simulator

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Run the complete Guardian journey in one Simulator session and record it: sign in, build the five-person roster through two minor consent flows and three adult flows, train five likenesses, confirm them, generate a twelve-Page illustrated Storybook with the real family recognisable, and read it. Record the evidence.

## Acceptance criteria

- [ ] One recorded Simulator session shows the full journey from sign-in to a finished twelve-Page Storybook with real likeness art.
- [ ] The evidence file records the five fal.ai request ids, the reconciled total live spend, and confirms it is under `$20` (`COST-1`).
- [ ] Native cold start p95 is under 3 seconds and Page turn p95 is under 100 milliseconds, measured in the session (`LAT-4`).
- [ ] Every invariant named in PRD v23 is listed in the evidence file with `held` or `violated`, and no invariant is left unstated.
- [ ] The run reports `BLOCKED` rather than `PASS` if any live evidence is missing; a deterministic pass alone never counts as the demo.
- [ ] Pro access in the demo is obtained through a server-authoritative grant and the entitlement gate is genuinely exercised; no client flag or build-time bypass is used (`ENT-1`).
- [ ] The app is styled and framed as an iPhone app throughout, with correct safe areas (D2).

## Verification-command

```bash
npx vitest run tests/212-demo-evidence.test.ts && npm run verify
```

## Blocked by

211, 217

## Invariants restated

all

## Notes

This is the demo. Everything before it exists to make this session possible.

**Target backend:** Vercel.
