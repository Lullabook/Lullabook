# 106 — Daily-life as a first-class destination

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
The Journal screen (`mobile/app/daily.tsx`) is **complete and works** (composer, Firsts
filter, timeline, inline "Make this a Story") but is reachable only via one Home card —
hence "no way to access daily life." Surface it as a **first-class destination** in the IA
(a visible Home/Journal entry or a real nav slot), keeping the inline story offer.

## Acceptance criteria
- [ ] Daily-life/Journal is a first-class, discoverable destination (not buried behind one
      Home card).
- [ ] The Moment composer, Firsts filter, timeline, and inline "Make this a Story" offer
      still work over real data.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
103
