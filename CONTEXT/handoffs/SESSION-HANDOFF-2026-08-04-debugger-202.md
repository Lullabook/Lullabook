# Debugger — #202 hardening

- **Ticket:** #202 / local 194
- **Commits:** `70778f1`, `6d92052`
- **Status:** Review Ready; native sandbox evidence remains human-owned.

Fixed and regression-tested: subscription tier/trial/entitlement expiry persistence, exact RevenueCat product validation, verified product-to-requested-tier matching, missing event IDs and unknown products failing closed, durable Family-bound event claims, cancellation/billing-issue future-expiry handling, explicit lifecycle states, out-of-order/expired event rejection, canonical R1 capability gates, and bounded native verification retries.

Evidence:
- Exact gate: `npx vitest run tests/194-revenuecat-lifecycle.integration.test.ts tests/194-r1-plan-single-source.test.ts && npm run verify` — **19/19 focused tests; full verify PASS** (Playwright skipped because no server/configured runner).
- Root/mobile typecheck, scoped ESLint, and diff checks passed.

Honest reviewing note: `react-native-purchases` remains intentionally deferred by ADR-0027/EAS milestone and live sandbox/restore evidence is human-owned. The server seam fails closed until that evidence exists; reviewer must judge the acceptance criterion independently.
