# 171 — Paywall CTA wiring + 403→paywall routing

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar A — the enforcement surface.
Carries **D5**, **FAIL-1**, **FAIL-2**, **SEC-1/4**.

## What to build
1. **CTA (D5).** `mobile/app/billing.tsx` — the "Start your 7-day free trial" button calls
   `PurchaseController.startTrial()` (issue 170) instead of `router.dismiss()`. On `ok`, refetch
   entitlement and dismiss to the unlocked action; on `error`, show a retryable inline error
   (FAIL-2) and stay on the paywall (Household stays unentitled).
2. **403 → paywall routing (D5, SEC-1).** In `mobile/lib/api.ts`, a server **403** with an
   entitlement code (`not_entitled` / `create_not_allowed` / `story_cap_reached`) is surfaced
   as a typed error the caller routes to the paywall (`billing.tsx`). The **server 403 is the
   boundary** — the client never decides entitlement locally. Non-entitlement 403s are not
   hijacked into the paywall.
3. **Fail closed (SEC-4).** If entitlement/paywall state can't be resolved, the gated action
   stays **blocked** (route to paywall), never silently allowed.
4. **Config fetch (FAIL-1).** Keep the existing static Just-Us fallback when
   `fetchPaywallConfig` fails — never a white screen; render **< 500ms** without blocking on
   the fetch (PERF-2).

## Acceptance criteria
- [ ] D5: paywall CTA runs `startTrial`; success unlocks the gated action, failure shows a
      retry and stays unentitled.
- [ ] SEC-1: a gated API call returning 403 (`not_entitled`/`create_not_allowed`/
      `story_cap_reached`) routes the user to the paywall; entitlement is never decided client-side.
- [ ] SEC-4: unresolved entitlement → action blocked (paywall), never allowed.
- [ ] FAIL-1 / PERF-2: config-fetch failure renders the static fallback, no white screen,
      first paint < 500ms.
- [ ] Mobile typecheck clean; `npx eslint mobile` clean.

## Verification-command
```bash
npx vitest run tests/171-paywall-cta-403-routing.test.ts && npm run verify
```

## Blocked by
170
