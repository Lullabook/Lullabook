# 131 — Onboarding aha: Demo Story → sign-up → trial → consent → photos

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track B.

## What to build
Wire the R1 first-run path into one coherent flow: a pre-baked **baby-free Demo Story**
(illustrated, < 1s, no model call) shown **before** any sign-up → "Make one starring my baby"
→ sign up → start trial (128) → **Email-Plus consent** (127) → upload baby photos. Baby Persona
creation gated on consent + entitlement.

## Acceptance criteria
- [ ] First open shows the illustrated Demo Story in < 1s (pre-baked, no generation).
- [ ] CTA → sign up → trial → consent → photo upload, in order; persona creation gated on
      consent + entitlement (server-enforced).
- [ ] Flow tested end-to-end on mobile; passes `lullabook-design-check`.

## Verification-command
```bash
npm test -- onboarding && (cd mobile && npx tsc --noEmit)
```

## Blocked by
127, 128
