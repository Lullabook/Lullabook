# 116 — Two-plan entitlement model (Just Us / Our Whole Family)

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track C. ADR-0025.

## What to build
Replace the Basic/Normal/Plus tier config in `EntitlementService` with the two-plan model
(ADR-0025). Add a **member-login cap** field — **distinct from the likeness `memberCap`**
(which guards LoRA cost) — and the plan→cap/capability mapping (Just Us: 8 stories, no
voice/video, login-cap=parent; Our Whole Family: 20 stories, voice+video, login-cap=family).
Add `requireMemberLoginSlot(familyId)` (403 over cap). Keep entitlement keyed on `familyId`.

## Acceptance criteria
- [ ] `EntitlementService` returns Just Us / Our Whole Family entitlements (caps, login cap,
      voice/video capability) per ADR-0025.
- [ ] `requireMemberLoginSlot` enforces the login cap (403 over cap), distinct from the
      likeness cap.
- [ ] Entitlement stays server-authoritative; the dev override stays prod-guarded — test
      asserts no effect in production.

## Verification-command
```bash
npm test -- entitlement && tsc --noEmit
```

## Blocked by
110
