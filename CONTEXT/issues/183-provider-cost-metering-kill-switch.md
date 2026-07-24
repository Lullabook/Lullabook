# 183 — Meter provider COGS and enforce margin/cost kill switches

Triage: ready-for-agent

> **Coder update 2026-07-24 — TESTS 7/7 PASS; METERING + KILL-SWITCH SERVICE
> IMPLEMENTED.** Every provider attempt recorded with ownership + redaction.
> Storybook cost queryable (attempted vs successful, retries, training
> amortization). Shared 4-Story allowance atomic + reset without rollover.
> Green/amber/red thresholds with 70% P95 margin floor. Red threshold blocks new
> spend while drafts + Hard-delete remain available. **Debugger scope:** metering
> service not yet wired into production Storybook/provider paths; Supabase store
> doesn't persist ledger/kill-switch/allowance state.

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.


## What to build

Make direct delivery cost observable and enforceable. Record each text, image, training, moderation, storage/egress, queue, retry, and repair attempt against its owning Family and artifact; expose aggregate Storybook/account usage without secrets; enforce plan allowance and provider/model kill switches when budget or reliability thresholds are crossed.

## Acceptance criteria

- [ ] Each attempt records provider, endpoint, model, pricing version, units, estimated/actual cost, latency, request ID, owning entity IDs, and terminal outcome without prompt/photo/credential leakage.
- [ ] Successful and attempted Storybook cost are separately queryable, including failed/retried work and Persona-training amortization inputs.
- [ ] The shared four-Story allowance and reset are server-authoritative and race-safe.
- [ ] Green/amber/red cost thresholds implement ±5%, 5–10%, and greater-than-10% budget variance plus the 70% P95/full-cap margin floor.
- [ ] A red threshold can disable new spend or one provider/model route without hiding existing drafts or deletion controls.
- [ ] Refunded Story allowance and provider-cost ledger entries remain auditable rather than being erased.
- [ ] No unbounded rollover, per-Persona allowance multiplication, or silent paid overage is introduced.

## Verification-command

```bash
npx vitest run tests/183-provider-cost-metering.test.ts && npm run verify
```

## Blocked by

- GitHub issue #150 (local ticket 176)
- GitHub issue #151 (local ticket 177)
