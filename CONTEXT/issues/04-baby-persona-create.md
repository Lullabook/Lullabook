# 04 — Baby Persona creation (Guardian-only, consent-gated)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0001, ADR-0002, ADR-0006, ADR-0008

## What to build

A Guardian creates a Baby Persona: only a Guardian may do so, only after the
subscription + consent gate (02) passes. Reuses the upload → pre-flight → train →
ready/failed path from Adult Persona (03) minus liveness (a baby can't do a
selfie), substituting Guardian role + consent receipt as the authorization.

## Acceptance criteria

- [ ] Only a Member with the Guardian role can create a Baby Persona; others are blocked.
- [ ] Creation is blocked unless the consent gate (02) is satisfied (active sub + consent receipt).
- [ ] Upload → pre-flight checks → training → ready/failed, same as 03.
- [ ] Persona kind is recorded as Baby (distinct from Adult).
- [ ] Service-seam tests with faked trainer; authorization tests for the Guardian role.

## Blocked by

- 02 — Subscription + consent gate
- 03 — Adult Persona creation
