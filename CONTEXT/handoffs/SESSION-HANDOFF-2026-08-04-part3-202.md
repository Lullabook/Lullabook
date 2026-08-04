# Part3 — #202 hardening

- **Ticket:** #202 / local 194
- **Commit:** `70778f1`
- **Status:** Debugging; not ready for grading because native SDK wiring remains an explicit dependency/release blocker.

Fixed the server-side release blockers: subscription `tier`, trial expiry, and entitlement expiry now persist through Supabase; RevenueCat products are exact monthly/annual IDs; missing event IDs and unknown products fail closed; signed lifecycle claims use a durable Family-owned inbox with a unique event index; cancellation/billing-issue access respects future expiration; refund reversal/subscription extension/product-change parsing is covered; R1 capability gates collapse legacy Plus in R1; native verification retries are bounded.

Evidence:
- `npx vitest run tests/194-revenuecat-lifecycle.integration.test.ts tests/194-r1-plan-single-source.test.ts tests/91-entitlement-model.test.ts tests/129-one-plan.test.ts` — **35/35 passed**.
- Root/mobile typecheck, scoped ESLint, and diff checks passed.

Remaining blocker: `react-native-purchases` is not installed/wired in the native-capable mobile profile, and the live native sandbox/restore evidence is human-owned. Do not move #202 to Grader Ready until that dependency/profile decision is authorized and proven.
