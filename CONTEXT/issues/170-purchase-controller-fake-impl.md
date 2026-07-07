# 170 — Mobile `PurchaseController` + `FakePurchaseController`

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar A — the abstraction seam.
[ADR-0027](../docs/adr/0027-purchase-controller-fake-first-r1-entry.md).

## What to build
1. **Interface.** A `PurchaseController` in `mobile/lib/` with (at least)
   `startTrial(plan?): Promise<PurchaseResult>` where `PurchaseResult` reports
   `ok | error` and carries the refreshed entitlement. One interface, so the R1 fake and the
   deferred real impl are interchangeable (ADR-0027).
2. **FakePurchaseController.** `startTrial()` POSTs `/api/billing/start-trial` (issue 169) via
   the existing `mobile/lib/api.ts` (Bearer attached), then refetches server-authoritative
   entitlement. **No client-side entitlement state is trusted** (SEC-1) — the server response
   is the source of truth.
3. **Real impl — documented, not built.** Leave a clearly-marked `RevenueCatPurchaseController`
   seam (a stub that throws "not available in Expo Go — EAS milestone" or is behind a
   `__DEV__`/flag branch) so the swap point is explicit. Do **not** add `react-native-purchases`
   to `mobile/package.json` (native module; breaks Expo Go). The controller **selection**
   (fake vs real) is a single factory the app calls.
4. **Failure (FAIL-2, SEC-4).** A failed/again purchase returns `error` and leaves the app
   unentitled; never optimistically flips local "paid" UI ahead of the server.

## Acceptance criteria
- [ ] `PurchaseController` interface + `FakePurchaseController` exist; a factory returns the
      fake in R1 (real impl selected only behind the EAS/flag branch).
- [ ] SEC-1: `startTrial` derives entitlement from the **server** refetch, not client state.
- [ ] FAIL-2 / SEC-4: a failed start-trial returns `error` and leaves the app unentitled (no
      optimistic paid UI).
- [ ] `react-native-purchases` is **not** a dependency; the real seam is present but inert.
- [ ] Mobile typecheck clean; `npx eslint mobile` clean.

## Verification-command
```bash
npx vitest run tests/170-purchase-controller.test.ts && npm run verify
```

## Blocked by
169
