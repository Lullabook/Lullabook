# 206 — Import and curate the Guardian's photo folder into training sets

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

The Guardian supplies a folder named `lullabook family testing` on the Mac plus a handover document mapping each subfolder to a person, an age, and whether that person is a minor. Build the intake path that reads that document, validates each person's photo set against a documented quality checklist, and reports what is unusable before any upload happens.

## Acceptance criteria

- [ ] Intake refuses to run when the handover document is missing, and names the expected path in the error.
- [ ] Each person in the handover document is validated for count (10 to 20 photos), and a person outside that range is reported as unusable with the reason.
- [ ] A photo containing more than one detectable face is reported as unusable, because group shots train a poor LoRA.
- [ ] Every person is labelled `minor` or `adult` from the handover document, and an unlabelled person is rejected rather than defaulted.
- [ ] Intake writes a machine-readable report of accepted and rejected photos per person, and uploads nothing in this ticket (`SEC-2`).

## Verification-command

```bash
npx vitest run tests/206-photo-intake.test.ts && npm run verify
```

## Blocked by

202

## Invariants restated

SEC-2

## Notes

BLOCKED ON THE GUARDIAN. Training cannot start until the folder `lullabook family testing` and the handover document exist. This is user-owned work and it is the longest lead-time item in the plan.

**Target backend:** Local dev; nothing is uploaded in this ticket.
