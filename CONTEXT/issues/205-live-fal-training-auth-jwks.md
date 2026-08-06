# 205 — Complete live fal.ai training submission and JWKS-verified callbacks

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Finish the remaining live half of local issue 179: wire `PersonaService.startTraining()` to the real fal.ai queue endpoint and verify callbacks against fal.ai's live JWKS public keys. Build the training ZIP from moderated images only, persist the request identifier, and copy the returned weights into Family-owned storage.

## Acceptance criteria

- [ ] Training submission uploads one ZIP containing only moderated images plus captions, and persists the fal.ai request id, model, and step count.
- [ ] A callback is rejected before any business data is parsed unless its timestamp, body hash, and signature verify against fal.ai's live JWKS keys (`SEC-4`).
- [ ] A duplicate, stale, or out-of-order callback leaves state and spend unchanged (`FAIL-5`).
- [ ] A verified callback advances the Persona within 30 seconds of receipt (`LAT-6`).
- [ ] `diffusers_lora_file` and the configuration artifact are copied into Family-owned storage; no provider temporary URL is stored as an owned blob key.
- [ ] A fal.ai 4xx, 5xx, timeout, or malformed artifact drives the Persona to a durable `failed` state with a redacted reason and leaves no orphaned blob (`FAIL-3`).

## Verification-command

```bash
npx vitest run tests/205-live-fal-training-auth.test.ts && npm run verify
```

## Blocked by

203, 204

## Invariants restated

SEC-4, FAIL-3, FAIL-5, LAT-6

## Notes

Live JWKS was the blocker that kept local issue 179 open. Deterministic tests fake the JWKS endpoint; the live key fetch is proven in ticket 208.

**Target backend:** Vercel.
