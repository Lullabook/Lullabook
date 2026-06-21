# 98 — First-open demo "aha" + Day-0 paywall placement

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track C.

## What to build
The first-open experience that earns trust **before** the card, then places the paywall
at the moment of highest intent — required because there is no free tier (ADR-0023).

- A **pre-baked, baby-free demo Story** ("meet Maya") a new user can read + hear in
  <90s, no signup/card — the aha.
- After the aha, present the **Day-0 paywall** (annual-default; trial-of-Normal CTA);
  starting the trial requires a card (= VPC, ADR-0008) and unlocks putting **their** baby
  in stories.

## Acceptance criteria
- [ ] A first-time user reaches a playable demo Story without signup or card.
- [ ] **Security invariant:** the demo is **baby-free** (no child likeness); uploading the
      real baby is gated behind starting the trial (card-on-file VPC).
- [ ] The paywall appears **after** the aha, not before; annual is the default option.
- [ ] **Failure invariant:** if the demo asset fails to load, the user still reaches a
      usable state (retry / skip-to-paywall), never a white screen.
- [ ] Tests cover the demo-before-card flow, the baby-upload gate, and paywall placement.

## Verification-command
```bash
npm test -- first-open && tsc --noEmit
```

## Blocked by
91, 92, 96
