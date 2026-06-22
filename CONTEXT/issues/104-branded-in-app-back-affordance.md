# 104 — Branded in-app back affordance + custom headers

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
There is **no in-app back button anywhere** — every pushed screen relies on the bare
native iOS chevron ("simulator giving buttons"). Add a Maya-UI header/back-pill component
(guarded by `router.canGoBack()`) and apply it to pushed screens (custom header or a
branded `headerLeft`). Use the `lullabook-design` tokens; finish with `lullabook-design-check`.

## Acceptance criteria
- [ ] Every pushed screen has a **branded in-app back affordance**; none relies solely on
      the native chevron.
- [ ] Back is guarded by `canGoBack()` — no dead-end, no crash at the stack root.
- [ ] Header/back matches the Maya design tokens (passes `lullabook-design-check`).

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
103
