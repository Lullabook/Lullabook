# 168 — Subscription trial model (`trialEndsAt`) + `activateTrial`

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar A (payment entry) root.
[ADR-0027](../docs/adr/0027-purchase-controller-fake-first-r1-entry.md).

## What to build
1. **Domain.** Add `trialEndsAt?: Date | null` to `Subscription` (`src/domain/types.ts`). No
   new `SubscriptionStatus` — a trial is `status: "active"` **with** `trialEndsAt` set. Keep
   `plan`/`tier` handling as-is (R1 = Just Us → legacy `tier` maps forward via `tierToPlan`).
2. **Expiry.** `SubscriptionService.isActive(familyId)` (`src/services/subscription.ts:61`)
   returns true only when the subscription is `active` **AND** (`trialEndsAt` is null/unset OR
   `now < trialEndsAt`). A trial past `trialEndsAt` reads as **not** active (Household
   re-hits the paywall). Non-trial active subs (no `trialEndsAt`) are unaffected.
3. **Activate.** Add `SubscriptionService.activateTrial(familyId, plan = "just_us")` that
   writes the **same subscription shape the RevenueCat webhook writes** (status `active`,
   Just-Us tier, `trialEndsAt = now + 7d`), **idempotently** — a second call for an already
   active/trialing Household does not extend or duplicate. This is the single seam both the
   fake endpoint (169) and the real webhook converge on.

## Acceptance criteria
- [ ] `Subscription.trialEndsAt` exists; a trial sub is `active` + `trialEndsAt = now+7d`.
- [ ] SEC-4 (fail closed): `isActive` returns false past `trialEndsAt`; a null/absent
      `trialEndsAt` on an active sub still reads active (non-trial subs unaffected).
- [ ] `activateTrial` is idempotent (twice → one sub, unchanged `trialEndsAt` on replay).
- [ ] PERF-1: `isActive` / `activateTrial` are single-row reads/writes (no scan).
- [ ] Existing suite green; root typecheck clean.

## Verification-command
```bash
npx vitest run tests/168-subscription-trial-model.test.ts && npm run verify
```

## Blocked by
_none_
