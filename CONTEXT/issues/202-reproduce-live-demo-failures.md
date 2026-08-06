# 202 — Reproduce and record every live demo failure with the Guardian

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Sit with the Guardian and run the app in the iOS Simulator. Walk the five demo flows: sign-in, Family roster, Persona creation, Story generation, and the reader. For each flow capture the FIRST failure only: the exact screen, the exact error text, the server log line, and the request that failed. Do not fix anything in this ticket. Write the findings to `CONTEXT/handoffs/DEMO-FAILURE-REPRODUCTION.md` with one section per flow, each naming a root-cause hypothesis and the ticket that will own the fix.

## Acceptance criteria

- [ ] `CONTEXT/handoffs/DEMO-FAILURE-REPRODUCTION.md` exists and contains a `## Sign-in`, `## Roster`, `## Persona creation`, `## Story generation`, and `## Reader` section.
- [ ] Each of the five sections records either an observed failure with its verbatim error text, or the literal word `WORKS` with the evidence that proves it.
- [ ] Each observed failure names one owning ticket number from PRD v23.
- [ ] No application source file is modified by this ticket; only the findings document is added.

## Verification-command

```bash
npx vitest run tests/202-reproduction-doc.test.ts && npm run verify
```

## Blocked by

none

## Invariants restated

LAT-4

## Notes

The Guardian participates directly. This ticket replaces a `/wayfinder` pass, so it is timeboxed: if a flow cannot be reproduced in 45 minutes, record that fact and move on.

**Target backend:** Local dev for the UI flows, Vercel for anything that reaches a provider.
