# 105 — Billing as a reachable modal

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
`billing.tsx` and `modal.tsx` are orphaned (not declared in a layout, no
`presentation: "modal"`), and **no route navigates to `/billing`** — the paywall is
unreachable; the account upgrade CTAs only `setNotice`. Register `billing` (and `modal`)
with `presentation: "modal"` and wire `router.push("/billing")` from the upgrade CTAs.

## Acceptance criteria
- [ ] Billing presents as a **dismissible modal** with an explicit close.
- [ ] Upgrade CTAs actually open billing (no dead `setNotice`).
- [ ] No orphan/unregistered route renders with default chrome.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
103
