# 107 — Dev-only seed reachable from the app
Status: shipped
Exposed seedMayaWorldRuntime to the native app via a Bearer-authed dev-only route /api/dev/seed, double-gated on NODE_ENV !== "production" AND DEV_DEMO_SEED === "true" (mirrors the DEV_FORCE_SUBSCRIPTION pattern), plus a __DEV__-only Family-tab button. Idempotent (bails if already populated); inert in prod / without the flag.
Binding invariant: dev-only routes must double-gate on NODE_ENV + an explicit flag, server-authoritative. Seed content itself later made "honest" (real text+images) by issue 124.
(condensed 2026-07-07 — full spec in git history)
