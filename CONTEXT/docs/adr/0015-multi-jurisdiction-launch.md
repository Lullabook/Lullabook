# 0015 — Broad multi-jurisdiction launch on a jurisdiction-aware consent engine

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0007](0007-data-lifecycle-and-deletion.md), [ADR-0008](0008-verifiable-parental-consent.md)

> ⚠️ Engineering design intent, not legal advice. A broad multi-jurisdiction
> launch handling minors' biometric data is a heavy legal undertaking and
> **must** have per-market counsel sign-off before launch in that market.

## Context

The founder is based in Singapore and wants v1 available across **Asia + US at
once**, not a contained single-regime launch. "Asia" spans multiple, divergent,
and in places *stricter-than-COPPA* child-data regimes:

- **US — COPPA:** child = under 13; verifiable parental consent.
- **Singapore — PDPA:** biometric data sensitive; under-13 parental consent;
  PDPC children's-data guidance.
- **India — DPDP Act:** child = **under 18**; verifiable parental consent for any
  child's data; bans tracking/targeted ads to children.
- **South Korea — PIPA:** guardian consent under 14; data-localization leanings.
- **Japan — APPI**, **Indonesia — PDP Law**, etc.

A COPPA-hardcoded "under-13" design is therefore insufficient.

## Decision

Launch broadly, but build a **jurisdiction-aware consent engine** as a
first-class part of the system, configurable per market:

- **Child-age threshold** per jurisdiction (e.g. 13 US, 18 India).
- **Consent method/strength** per jurisdiction (payment-VPC baseline per
  [ADR-0008](0008-verifiable-parental-consent.md), escalated where a market
  requires more).
- **Data-residency region** per market — storage must be **region-pinnable**
  (Supabase region + R2/S3 bucket region per [ADR-0011](0011-backend-architecture.md)).
- **Consent-notice + retention rules** versioned per jurisdiction.

Jurisdiction is detected/declared at signup and drives the consent flow, the
allowed Persona-creation rules, and where data physically lives.

## Consequences

- **Heavy, non-optional:** per-market legal review, DPIAs (GDPR-style where
  applicable), data-residency infrastructure, and localized consent notices are
  launch prerequisites for each market — a large lift for a solo founder.
- The "child" definition is **data, not a constant** — every age/consent check
  reads the user's jurisdiction config, never a hardcoded 13.
- Data residency may require **multiple storage regions** and routing logic from
  day one, not as a later refactor.
- Strongly recommended: stage market enablement (feature-flag per country) so
  markets can be switched on only once their legal review + residency are ready,
  even though the *design* targets all of them.

## Considered Options

- **US-only first** — smallest legal surface; rejected by the founder in favor of
  reach.
- **Singapore-only first** — most contained; rejected for the same reason.
- **Broad launch, COPPA-hardcoded** — fastest to code; rejected because it forces
  a rewrite of the consent core the moment a non-13 regime (e.g. India) is added.
