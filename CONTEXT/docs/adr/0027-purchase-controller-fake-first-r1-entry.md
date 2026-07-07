# 0027 — PurchaseController (fake-first) and the R1 two-gate entry

- Status: Accepted (2026-07-07)
- Depends on: [ADR-0025](0025-two-plan-monetization.md) (two-plan model; R1 one-plan
  amendment in `paywall-config.ts`), [ADR-0018](0018-native-ios-app-iap-and-email-plus-vpc.md)
  (Apple IAP via RevenueCat; Email-Plus VPC because IAP cannot prove payer identity),
  [ADR-0008](0008-verifiable-parental-consent.md) (no child likeness without VPC).
- Amends: ADR-0008 for the mobile surface — on iOS **payment and consent are separate gates**
  (the "trial card = VPC" mechanism is web-only; iOS uses Email-Plus).

## Context

The monetization spine already exists in code and is largely built: `EntitlementService`
(server-authoritative plan/cap/create-rights gates), `StoryCapService` (enforced at
`storybook.ts:120,183`), `CreditLedgerService`, `SubscriptionService`, the RevenueCat webhook
route + adapter, `EmailPlusVpcService`, `DemoStoryService` + `FirstOpenService`, and a
server-authoritative `paywall-config` whose `getR1VisiblePlans()` already collapses R1 to the
single **Just Us** plan. Two things are *not* wired, and they are exactly the load-bearing
ones:

1. **No real purchase.** `mobile/package.json` has no `react-native-purchases`; the paywall's
   "Start your 7-day free trial" button does `router.dismiss()` — it buys nothing. `react-
   native-purchases` is a **native module**, so it cannot run in **Expo Go**, which is how
   this entire project is tested on the iOS Simulator. Wiring real IAP forces the EAS
   dev-build + Apple Developer + App Store Connect IAP + RevenueCat project + sandbox-tester
   jump the project has deferred repeatedly.
2. **No consent gate.** `PersonaService.createBaby` has **no** `consent_verified` check — a
   Baby Persona (minor biometric LoRA) can be created today with zero verifiable parental
   consent, the precise thing ADR-0008 forbids.

The core loop (PRD v19) is also not yet verified live. Layering an un-simulatable native
purchase on top of an unverified loop would leave the whole entry path unexercisable until an
EAS pipeline exists.

## Decision

**Ship the R1 entry gates behind a `PurchaseController` abstraction with a fake, Simulator-
verifiable implementation now, and defer the real RevenueCat native SDK to the EAS milestone.
Treat payment and consent as two separate server gates.**

1. **PurchaseController seam.** One mobile interface (`startTrial()`), two implementations.
   The **FakePurchaseController** (R1) calls a real, **prod-guarded** `POST
   /api/billing/start-trial` that activates a 7-day trial subscription **idempotently and in
   the same shape the RevenueCat webhook writes** (status `active`, plan `just_us`,
   `trialEndsAt = now + 7d`). The real `react-native-purchases` implementation is a later thin
   swap: it calls `Purchases.purchasePackage()`, and the server learns via the **existing**
   webhook — the state-flip code is untouched. The client re-fetches server-authoritative
   entitlement after either path.

2. **Prod guard.** The start-trial endpoint is refused outside non-production / `DEV_*` env,
   mirroring `DEV_FORCE_SUBSCRIPTION`. It can never mint a free subscription for a real payer
   in production.

3. **Two gates, not one.** Payment (the trial) and consent (Email-Plus VPC) are independent
   server checks. `requireConsentVerified(familyId)` gates `createBaby`; the entitlement gate
   gates paid generation. On iOS neither substitutes for the other (ADR-0018): the card
   unlocks *paying* for likeness, Email-Plus unlocks the *legal right* to create it. Both
   fail **closed**.

4. **Trial expiry, deferred renewal.** R1 models `trialEndsAt` and stops access past it
   (re-paywall). Auto-renew / charge / `past_due` grace is RevenueCat's and is deferred.

5. **R1 stays one plan.** No change to `getR1VisiblePlans()`; "Our Whole Family" stays hidden
   until its cut features (voice/video/invited members) exist. The three-tier-era issues
   91/92/94/95/99 are **superseded** (their services are built); the credit ledger meters
   nothing in R1 (video/custom-style are cut) and its in-memory persistence is left as-is.

## Consequences

- The entire entry funnel (demo → signup → trial → consent → photos) is **verifiable on the
  Simulator against the verify gate**, with no dependency on Apple/RevenueCat account
  provisioning. Only the native purchase bridge is deferred, and it is isolated to one
  implementation of one interface.
- A future **EAS milestone** must: install `react-native-purchases`, stand up App Store
  Connect IAP + a RevenueCat project, produce a dev build, and exercise a sandbox trial. At
  that point the real trial-card-on-file *may* additionally serve as VPC on web, but iOS
  keeps Email-Plus regardless (ADR-0018).
- **Risk — the fake is a real code path.** If the prod guard on `/api/billing/start-trial`
  ever regresses, anyone could self-activate a free subscription. This is load-bearing and is
  an explicit invariant (SEC-2) with a test that asserts the endpoint refuses in prod.
- **Risk — reconciliation is deferred.** With real IAP, a paid-at-Apple-but-webhook-missed
  Household would be unentitled until a restore-purchases path exists. Out of R1 scope,
  documented as the first EAS-milestone follow-up.
- Closing the consent hole means Baby Persona creation now **requires** a working Email-Plus
  flow on mobile; a Household cannot add its baby's photos until consent is verified. This is
  the intended COPPA posture, not a regression.

## Considered options

- **Full real IAP now** — rejected for R1: forces the EAS/Apple/RevenueCat infra jump and
  makes the entry path unverifiable in Expo Go, on top of an unverified core loop. It is the
  next milestone, not this one.
- **Email-Plus consent only, defer all payment** — rejected: ships a de-facto free tier,
  contradicting ADR-0008 (no free tier; trial is the entry) and delivering no monetization.
- **Reuse `DEV_FORCE_SUBSCRIPTION` for the fake trial** — rejected: the override is not a real
  subscription row (no `trialEndsAt`, different code path than the webhook), so the real-IAP
  swap would be dirtier and the trial lifecycle would go unmodeled.
