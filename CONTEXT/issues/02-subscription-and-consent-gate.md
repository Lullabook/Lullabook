# 02 — Subscription + consent gate (payment-VPC)

- Type: HITL (legal sign-off on consent notice) · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0008, ADR-0009, ADR-0015

## What to build

A user can subscribe via Stripe, and that paid status — plus an explicit consent
notice — becomes the gate that unlocks creating a Baby Persona. Introduces the
config-driven `ConsentEngine` (one jurisdiction wired live: US/COPPA under-13;
others stubbed) and stores a **consent receipt**. No minor's photos can be
uploaded until the user holds an active subscription and has consented.

## Acceptance criteria

- [ ] A user can start a subscription via Stripe Checkout and the app reflects active status (webhook).
- [ ] `ConsentEngine.check(jurisdiction, actor, action)` returns allow/deny + required method; pure, table-driven unit tests.
- [ ] Attempting Baby Persona creation without active subscription is blocked.
- [ ] A clear consent notice is shown and acceptance is recorded as a consent receipt (who/when/notice-version).
- [ ] User can cancel; status updates.
- [ ] Consent notice copy reviewed by counsel (HITL).

## Blocked by

- 01 — Walking skeleton
