# 169 — Prod-guarded `POST /api/billing/start-trial` endpoint

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar A. Carries invariant **SEC-2**.
[ADR-0027](../docs/adr/0027-purchase-controller-fake-first-r1-entry.md).

## What to build
1. **Route.** `POST /api/billing/start-trial` (Bearer-authenticated like the other mobile API
   routes) resolves the actor's `familyId` from the verified JWT and calls
   `SubscriptionService.activateTrial(familyId)` (issue 168), persists, and returns the fresh
   entitlement (so the client can refetch in one round-trip). Idempotent by construction (168).
2. **Prod guard (SEC-2).** The endpoint **refuses in production** — enabled only when running
   non-production **or** an explicit `DEV_*` env is set (mirror the `DEV_FORCE_SUBSCRIPTION`
   guard already in the codebase; reuse its env check rather than inventing a new one). In
   prod it returns a clean 403/404 and does **not** touch subscription state. This is the
   load-bearing guard: without it, anyone could mint a free subscription.
3. **Failure (FAIL-2).** On any error, no partial "paid" state is written and the response is
   a structured retryable error (no 500 stack to the client).

## Acceptance criteria
- [ ] Non-prod: a valid Bearer request activates a Just-Us trial and returns entitlement;
      `isActive` is then true.
- [ ] SEC-2: a request in a **production** env (guard env set to prod) is **refused** and
      writes no subscription state — asserted by a test that flips the env.
- [ ] Idempotent: two calls → one trial sub, unchanged `trialEndsAt`.
- [ ] FAIL-2: an `activateTrial` failure yields a structured error and leaves the Household
      unentitled (fail closed, SEC-4).
- [ ] Existing suite green; root typecheck clean.

## Verification-command
```bash
npx vitest run tests/169-start-trial-endpoint.test.ts && npm run verify
```

## Blocked by
168
