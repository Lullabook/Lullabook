# 107 — Dev-only seed reachable from the app

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
The substantial `seedMayaWorldRuntime` seed is web/CLI only. Expose it to the native app
via a Bearer-authed **dev-only API route** (`/api/dev/seed`) **double-gated**
(`NODE_ENV !== "production"` AND `DEV_DEMO_SEED === "true"`, mirroring `seedDemoWorldAction`
/ the `DEV_FORCE_SUBSCRIPTION` guard), plus a `__DEV__`-only button on the mobile Family tab.

## Acceptance criteria
- [ ] In dev with the flag, the route populates a full roster + stories for the authed
      Household (idempotent — bails if already populated).
- [ ] The route is **inert in production / without the flag** — test asserts no effect in
      production (server-authoritative gate).
- [ ] The `__DEV__` mobile button triggers it and the roster appears.

## Verification-command
```bash
npm test -- dev-seed && tsc --noEmit
```

## Blocked by
(none)
