# 129 — Collapse to one plan for R1 (hide premium until it exists)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track B. Amends ADR-0025.

## What to build
Show **one plan** for R1 (illustrated stories, solo parent) + 7-day trial; hide "Our Whole
Family" everywhere until its features (voice/video/invited members) exist. Drive from the
shared web+mobile paywall config; keep the two-plan model in code behind config (don't delete).

## Acceptance criteria
- [ ] Mobile paywall renders exactly **one plan** + trial; the premium tier is not shown or
      sellable.
- [ ] Two-plan model remains in code behind config for R2; no entitlement regressions.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
npm test -- paywall && (cd mobile && npx tsc --noEmit)
```

## Blocked by
128
