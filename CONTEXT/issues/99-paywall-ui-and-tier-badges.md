# 99 — Paywall UI (3 tiers, annual-default) + tier badges + credit/upgrade surfaces

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track C.

## What to build
The customer-facing monetization surfaces that present the model from issues 91–94.

- **Paywall:** three tiers (Basic $8 / Normal $15 / Plus $25), annual-default toggle,
  the Founding-Family offer, value-before-price copy.
- **Tier badges** + entitlement-aware UI: gated features show an upgrade affordance (the
  real boundary is the server 403 from issue 91 — the UI is the prompt, not the gate).
- **Credit/limit surfaces:** show story-cap usage ("3/8 this month"), credit balance, and
  the "out of credits / cap reached — upgrade or buy" states from issues 93/94.

## Acceptance criteria
- [ ] Paywall renders the three tiers with annual-default and the founding offer; copy
      leads with value.
- [ ] Gated UI reflects entitlement and routes to upgrade; **the server 403 remains the
      boundary** (UI gating alone is never trusted).
- [ ] Cap/credit usage + exhaustion states render the structured data from issues 93/94
      (counts, reset date, CTAs) — never a dead end.
- [ ] Tests cover paywall render, entitlement-aware gating UI, and the cap/credit states.

## Verification-command
```bash
npm test -- paywall && tsc --noEmit
```

## Blocked by
91, 92
