# 14 — Multi-jurisdiction expansion (config + residency)

- Type: HITL (per-market legal review) · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0015

## What to build

Generalize the consent engine beyond the first (US) jurisdiction: add
per-jurisdiction config for additional launch markets — notably India (child =
under-18, VPC, no tracking/targeted ads to children), Korea (under-14 +
data-localization), Singapore (PDPA), Japan (APPI). Add region-pinnable
data-residency routing and per-country feature-flags so a market is enabled only
once its legal review + residency are ready.

## Acceptance criteria

- [ ] Child-age threshold, consent method, notice version, and residency region are read from per-jurisdiction config (never hardcoded).
- [ ] `ConsentEngine` table-driven tests cover US (under-13) and India (under-18) at minimum.
- [ ] Data is stored in the region configured for the user's market.
- [ ] A per-country feature flag gates whether signups from that market are accepted.
- [ ] Each enabled market has recorded legal sign-off (HITL).

## Blocked by

- 02 — Subscription + consent gate
