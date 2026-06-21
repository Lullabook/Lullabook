# 95 — Custom art-style trained Style-LoRA pipeline (Plus)

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track A.

## What to build
The Plus-tier **custom art style**: a durable pipeline that trains a **Style LoRA** bound
to the Household, used as a book's Style Bible — the same shape as the persona LoRA
pipeline (ADR-0002), metered via issue 94.

- From reference images / a chosen seed, enqueue a durable fal **style-LoRA training**
  step; status `generating → ready` (or `failed`), surfaced async.
- A book may select a ready custom style as its Style Bible (ADR-0012).
- **Train failure → fall back to the default Style Bible** and **refund the credit**
  (issue 94); the Story is never blocked.
- The Style LoRA is a **Family-scoped sensitive blob**; **hard-delete purges it** (ADR-0007).

## Acceptance criteria
- [ ] A custom-style train runs as a durable, idempotent step; status reaches `ready`
      within the budget (**<10min**, async) or `failed`.
- [ ] **Failure invariant:** train failure falls back to the default Style Bible **and
      refunds the credit**; generation continues.
- [ ] **Security invariant:** the Style LoRA is Family-scoped and **purged by hard-delete**;
      training is gated to Plus entitlement (403 otherwise) and metered by credits.
- [ ] Tests (faked fal adapter) cover train→ready, failure→fallback+refund, the
      entitlement 403, and hard-delete purge.

## Verification-command
```bash
npm test -- style-lora && tsc --noEmit
```

## Blocked by
91, 94
