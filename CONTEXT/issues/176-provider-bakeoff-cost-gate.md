# 176 — Budget-gated real-provider bake-off and model decision

Triage: ready-for-agent

> **Coder update 2026-07-24 — DRY GATE HARDENED + PUSHED.** Dry-run gate, cost
> reservation, and evidence validation are committed (`f97a2d6`, `7b02b98`):
> unreconciled provider outcomes now hard-stop instead of forging zero-cost
> failure evidence, positive spend is reserved before adapter submission,
> provider error text is redacted before evidence handling. Focused contract
> suite 13/13 passes. Live canary remains blocked on `FAL_API_KEY` /
> `ANTHROPIC_API_KEY` / `LIVE_PROVIDER_RUN_APPROVED` — no spend authorized.

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Build a repeatable, opt-in canary that uses only synthetic subjects or consenting adults and cannot spend more than the configured hard budget. It must compare FLUX.1 LoRA and FLUX.2 LoRA V2 training, single- and two-Persona output, selective Nano Banana repair, and the current Sonnet Story path against Sonnet 5 on one fixed golden set. Produce machine-readable cost/latency/provider evidence and a human quality rubric; do not change production routing automatically.

## Acceptance criteria

- [ ] The live command refuses to run without explicit credentials and a positive hard budget, and stops before `$10` for the approved research run.
- [ ] Fixtures use synthetic subjects or documented consenting adults; no minor photos or unrelated personal data enter the test.
- [ ] Two FLUX.1 and two FLUX.2 Persona runs plus one/two-Persona samples are compared on likeness, identity separation, prompt adherence, style consistency, safety, latency, failures, and actual cost.
- [ ] FLUX.2 uses `fal-ai/flux-2-trainer-v2`; 300-step failure does not trigger unapproved 500/1,000-step spend.
- [ ] Sonnet 4.6 and Sonnet 5 are scored on the same Brief/context golden set and semantic 12-Page contract.
- [ ] The report makes one explicit routing recommendation or blocks with the evidence required for another decision; production configuration remains unchanged.

## Verification-command

```bash
npx vitest run tests/176-provider-bakeoff-contract.test.ts && npm run verify
LIVE_PROVIDER_BUDGET_USD=10 npm run smoke:provider-bakeoff
```

## Blocked by

None — can start immediately.
