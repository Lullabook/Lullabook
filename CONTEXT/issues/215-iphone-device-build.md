# 215 — Build and run the demo on the real iPhone

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Produce the EAS dev build and run the full demo journey on the Guardian's iPhone. This ticket starts ONLY on an explicit user signal that the Apple Developer Program membership and the EAS subscription are purchased. It must never be claimed on a date trigger.

## Acceptance criteria

- [ ] The ticket is not started until the Guardian states that Apple Developer and EAS are purchased (D12).
- [ ] An EAS dev build installs and launches on the Guardian's iPhone.
- [ ] The full journey from ticket 212 is repeated on the device and recorded.
- [ ] Provider secrets are absent from the device bundle (`SEC-1`).
- [ ] Native cold start p95 is under 3 seconds on the device (`LAT-4`).
- [ ] The runbook records the Apple approval lead time actually observed.

## Verification-command

```bash
npx vitest run tests/215-device-build-config.test.ts && npm run verify
```

## Blocked by

212, plus an explicit user purchase signal

## Invariants restated

SEC-1, LAT-4

## Notes

WARNING: Apple can take 24 to 48 hours or longer to approve a new developer account. Buy as early as the Guardian is willing, because the approval wait is outside anyone's control. Local issues 198 to 201 (GitHub #206 to #209) cover the device launch script, LAN detection, entitlement flag, and runbook, and remain separate.

**Target backend:** Vercel.
