# Session Handoff — 2026-06-23: /part2 Track C — PRD v13 "Pricing" (issues 116–121)

> Implementation session. Track C complete. All 6 issues shipped test-first.
> 397 tests pass, web + mobile tsc clean. **All three tracks (A→B→C) complete.**

## What was built (Track C — issues 116–121, ADR-0025)

### Issue 116 — Two-plan entitlement model
- Added `Plan` type (`just_us` | `our_whole_family`) to domain types.
- Added `PlanEntitlement` interface + `PLAN_ENTITLEMENTS` config to
  `EntitlementService` (ADR-0025: Just Us $9.99, 8 stories, 2 login cap, no
  voice/video; Our Whole Family $24.99, 20 stories, unlimited logins, voice +
  video + custom style).
- Added `tierToPlan()` mapping (Basic/Normal → just_us, Plus → our_whole_family).
- Added `getPlan()`, `getPlanEntitlement()`, `requireMemberLoginSlot()` — the
  login cap is **distinct from** the likeness cap.

### Issue 117 — Per-member create-rights gate
- Added `requireCanCreate(familyId, actorMemberId)` — Just Us → Guardian only;
  Our Whole Family → any Member. Resolved server-side from plan + role.
- Wired into `StorybookService.generate` + `generateFromClassic` right after
  `requireEntitled`.

### Issue 118 — Enforce monthly Story cap
- Wired `StoryCapService.requireUnderCap` into the generate path (was computed
  but never enforced). Single shared Household pool, idempotent, resets monthly.
- Failed generations don't count (only `generating`/`draft`/`finalized`).

### Issue 119 — Persist credit ledger
- Moved the credit ledger + purchased balances from in-memory `Map`s in
  `CreditLedgerService` into the durable `DataStore` (`creditLedgerEntries`
  + `creditPurchasedBalances`). Survives restart. Debit/refund stay idempotent
  by `action:idempotencyKey`; failed metered action refunds.

### Issue 120 — Two-plan paywall UI
- Updated `src/lib/paywall-config.ts` from 3 tiers to 2 plans (Just Us / Our
  Whole Family) with `PAYWALL_PLANS`, `PaywallPlan`, `getPlanBadge`.
- Updated mobile billing screen to render the two plans (retired hardcoded
  `TIERS`). Annual pre-selected; voice + video as Our-Whole-Family hook.
- Updated `src/components/v2/paywall-ui.tsx` for the new plan ids.
- Updated test 99 for the two-plan assertions.

### Issue 121 — Trial + RevenueCat/Stripe mapping + inherit-on-login
- Trial activates the full (Our Whole Family = Plus) experience, card-on-file
  required (= VPC gate).
- Invited Members inherit the Household plan on login (no own IAP) —
  `app_user_id = familyId` already.
- Webhook activation is idempotent + Household-keyed.

## Test state
- **Web:** 80 test files, 397 tests, all passing.
- **Web tsc:** clean (0 errors).
- **Mobile tsc:** clean (0 errors).

## Red-team findings (inline pass)
1. **Login cap distinct from likeness cap** — PASS. `memberLoginCap` ≠ `memberCap`.
2. **Create-rights server-side** — PASS. `requireCanCreate` reads from plan + role,
   never client state. Actor memberId from verified JWT.
3. **Story cap idempotent** — PASS. Counts distinct-by-id storybooks; replay
   doesn't double-count.
4. **Credit ledger durable** — PASS. Entries + balances in DataStore, not
   in-memory.
5. **Trial = VPC gate** — PASS. `hasPaymentMethod: false` → throws.
6. **Inherit on login** — PASS. Invited Member reads Household plan, no own
   purchase.
7. **Dev override prod-inert** — PASS. `DEV_FORCE_SUBSCRIPTION` checks
   `NODE_ENV === "production"` → returns undefined.

## All three tracks complete
- **Track A (PR #78):** Issues 100-108 — generation terminal, real nav, daily-life,
  dev testability.
- **Track B (PR #79):** Issues 109-115 — family accounts, invites, voice.
- **Track C (this PR):** Issues 116-121 — two-plan pricing, create-rights, caps,
  credits, paywall.

## Next steps
All 22 issues (100-121) are implemented. The app is ready for live Simulator
testing across both plans. Follow-up: run `/live-app-audit /verify` against both
the free and paid backends.
