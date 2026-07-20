# 179 — Run real FLUX LoRA training through ZIP submission, signed webhooks, and owned artifacts

Triage: ready-for-agent

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Replace the synthetic training-success path with a production-compatible LoRA lifecycle. The backend builds and uploads the provider-required ZIP, submits the selected fal queue endpoint, stores the request ID, authenticates callbacks, handles them idempotently, validates the result, and copies weights/configuration into Family-owned storage before advancing the Persona to review.

## Acceptance criteria

- [ ] Training input is one accessible ZIP URL containing only moderated images plus valid captions/default caption.
- [ ] Queue submission uses the canary-selected endpoint/model and persists request/model/step/idempotency metadata.
- [ ] Callback verification checks timestamp, body hash, signature, and provider public keys before parsing business data.
- [ ] Duplicate, stale, malformed, failed, and out-of-order callbacks are safe and never double-spend or advance state incorrectly.
- [ ] The `diffusers_lora_file` and configuration result are validated and copied into Family-owned storage; temporary provider URLs are not used as owned blob keys.
- [ ] Real failure reaches a durable failed state with an observable redacted error; local fakes remain explicit and cannot satisfy release evidence.
- [ ] The backend, never the client, owns credentials and privileged provider calls.

## Verification-command

```bash
npx vitest run tests/179-fal-lora-contract.test.ts tests/179-fal-webhook.test.ts && npm run verify
```

## Blocked by

- GitHub issue #150 (local ticket 176)
- GitHub issue #152 (local ticket 178)
