# 120 — Two-plan paywall UI (shared config, web + mobile)

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track C. ADR-0025.

## What to build
Render the **two plans** (Just Us $9.99/$79.99 · Our Whole Family $24.99/$199.99) from **one
shared config** — retire mobile's hardcoded `TIERS` duplicate. Annual pre-selected; voice +
video presented as the Our-Whole-Family hook; entitlement-aware gating routes to upgrade
(the server 403 stays the boundary). Use `lullabook-design`; finish with
`lullabook-design-check`.

## Acceptance criteria
- [ ] Web + mobile paywall render the two plans from one shared config, annual default.
- [ ] Gated features show an upgrade affordance routing to billing; the server 403 remains
      the gate (UI gating never trusted).
- [ ] Cap/credit usage + exhaustion states render (never a dead end). Passes
      `lullabook-design-check`.

## Verification-command
```bash
npm test -- paywall && tsc --noEmit && (cd mobile && npx tsc --noEmit)
```

## Blocked by
105, 116
