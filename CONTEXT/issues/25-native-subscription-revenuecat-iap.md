# 25 — Subscription: RevenueCat IAP paywall + webhook → `active` state

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

Turn money on, end-to-end. A parent sees a native **paywall** (one entitlement
`active`; **monthly** + discounted **annual**; **no trial**) with the required
auto-renew disclosure, buys via **Apple IAP through RevenueCat**, and immediately
unlocks paid features client-side. A verified **RevenueCat webhook** activates /
cancels the Family's Subscription via the **same** `SubscriptionService` the
Stripe webhook drives, so web and iOS reach the same `active`/`inactive` state.
Restore-purchases and Apple's manage/cancel sheet are wired. Exact prices are set
by the operator in App Store Connect and fetched into the paywall.

## Acceptance criteria

- [ ] Native paywall renders the monthly + annual packages from RevenueCat
      offerings with the **auto-renew disclosure** (full price, period, how to
      cancel) pulled from product data; **no Stripe checkout** anywhere in the app.
- [ ] Purchasing the `active` entitlement unlocks paid UI immediately;
      **restore purchases** and **manage/cancel** (Apple sheet) work.
- [ ] A **RevenueCat webhook** route verifies the signature and flips the Family
      to `active` / `inactive` via `SubscriptionService`; a bad signature is
      rejected.
- [ ] A Family subscribed on **web (Stripe)** or **iOS (IAP)** reaches the same
      single `active` state (one entitlement, one server-side flag).
- [ ] The illustrated-generation / Persona-creation **gate** behaves exactly as
      today against the subscription state; **text generation is never gated**.
- [ ] Webhook → subscription activation tested at the route→service seam with a
      faked signature verifier; mirror `02-subscription-consent`.

## Blocked by

- [23 — Native auth end-to-end over a Bearer-authed backend](./23-native-auth-bearer-backend.md)
