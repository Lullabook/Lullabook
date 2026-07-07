# PRD v20 — Working monetization: R1 entry gates (fake-first purchase + consent)

> Grilled 2026-07-07, grounded in a codebase read. The monetization spine is **already
> built** (`entitlement`, `story-cap` [enforced], `credit-ledger`, `subscription`,
> `email-plus-vpc`, `first-open`, RevenueCat webhook, server-authoritative `paywall-config`
> whose `getR1VisiblePlans()` already collapses R1 to **Just Us**). This effort **wires the
> two entry gates and the mobile purchase path**; it does not build billing from scratch.
> Real Apple IAP is deferred to the EAS milestone. Reverses nothing in PRD v16/v19 — audio,
> multi-family, and Asia stay cut. See
> [ADR-0027](../docs/adr/0027-purchase-controller-fake-first-r1-entry.md). Branch:
> `feat/prd-v20-monetization-r1`.

## Why

R1's premise (a solo parent pays to put **their** baby in illustrated stories) has two gates,
and **both are stubbed or missing**:

- **Payment does nothing.** `mobile/package.json` has no `react-native-purchases`; the
  paywall's "Start your 7-day free trial" CTA is `router.dismiss()`. Nothing activates a
  subscription, and nothing routes a gated-action 403 to the paywall. `react-native-purchases`
  is a **native module** → cannot run in **Expo Go** (the project's Simulator test surface),
  so real IAP forces the deferred EAS/Apple/RevenueCat jump.
- **Consent is a hole.** `PersonaService.createBaby` performs **no** `consent_verified`
  check. A Baby Persona (minor biometric LoRA) can be created today with **zero** verifiable
  parental consent — exactly what ADR-0008 forbids. `EmailPlusVpcService` exists (send side)
  but is wired to nothing that blocks creation, and mobile has no consent screen.

## Decisions locked in the grill (2026-07-07)

1. **D1 — R1 ships one plan (Just Us).** No change to `getR1VisiblePlans()`; premium stays
   hidden until its cut features exist.
2. **D2 — PurchaseController abstraction; fake-first.** A `FakePurchaseController` for
   R1/Simulator; the real `react-native-purchases` (RevenueCat) implementation is a deferred
   thin swap onto the **same** server state (ADR-0027).
3. **D3 — Two gates, not one.** Payment (trial) **and** Email-Plus VPC consent are separate
   server checks; on iOS neither substitutes for the other (ADR-0018). Both fail **closed**.
4. **D4 — Fake `startTrial` → real, prod-guarded `POST /api/billing/start-trial`** that writes
   the **same subscription state the RevenueCat webhook writes** (idempotent).
5. **D5 — Demo free → wall on first real gated action.** Server 403 (`EntitlementError`) is
   the boundary; the client catches it and shows the paywall.
6. **D6 — Minimal Demo Story aha in scope.** Server already serves the static baby-free demo
   (`DemoStoryService`) + the 5-step `FirstOpenService` flow (demo → signup → trial → consent
   → photos); mobile wires it.
7. **D7 — Model `trialEndsAt`.** `isActive` = `active AND now < trialEndsAt`; renewal/billing
   deferred to RevenueCat.

**Superseded / not rebuilt:** the three-tier-era issues **91/92/94/95/99** (their services are
built). The **credit ledger** meters nothing in R1 (video + custom style are cut) — its
in-memory persistence is left as-is. **Founding-families "first month free"** stays
copy-only (no promo machinery). Demo illustrations are **bundled static / placeholder** (no
generation spend).

## Invariants (acceptance constraints — every issue that touches these restates them)

### SEC — Security / permission boundaries
- **SEC-1** Entitlement is **server-authoritative**; client UI gating is prompt-only. Every
  gated use-case passes a server check (`requireEntitled` / `requireCanCreate` /
  `requireCapability`). Blast radius of a bypass = one Household gets paid features free; no
  cross-tenant read.
- **SEC-2** `POST /api/billing/start-trial` is **prod-guarded** (non-production / `DEV_*`
  only) and **refuses in production**. If this regresses, anyone could mint a free
  subscription — so it ships with a test asserting a prod-env request is refused.
- **SEC-3** **No Baby Persona without `consent_verified`.** `createBaby` calls
  `requireConsentVerified(familyId)`; a create-baby attempt without a verified Household is
  rejected 403 and persists **no** partial Persona / accepts **no** photos.
- **SEC-4** Entitlement **and** consent checks **fail closed** — an error in the resolving
  service denies access, never grants it (the deliberate opposite of Sentry's fail-open).

### FAIL — Failure modes (each external dep: down / slow / rate-limited / garbage)
- **FAIL-1** `paywall-config` fetch fails → mobile renders the static **Just-Us fallback**
  (already present), never a white screen.
- **FAIL-2** start-trial call fails → the paywall shows a retryable error and the Household
  **stays unentitled**; no partial "paid" state is written.
- **FAIL-3** RevenueCat webhook (real path, deferred) down/malformed → subscription not
  flipped; reconciliation via a **restore-purchases** path is the first EAS-milestone
  follow-up (documented, not built in R1).
- **FAIL-4** Email-Plus consent email send fails (Resend down) → consent stays **unverified**,
  Baby Persona creation stays blocked (fail closed), the user sees a retry.
- **FAIL-5** Demo asset fails to load → the flow degrades to **skip-to-paywall**
  (`FirstOpenService.onDemoFailed`), never a white screen.

### PERF — Latency / performance budgets
- **PERF-1** Entitlement / cap check p95 **< 50ms** (in-memory / single-row read; not on the
  generation path).
- **PERF-2** Paywall screen first paint **< 500ms** — the plan config loads async and the
  static fallback renders immediately (never blocks on the fetch).
- **PERF-3** Start-trial round-trip (activate + entitlement refetch) p95 **< 1.5s** locally.
- **PERF-4** Demo Story render **< 1s** — static, bundled, no network and no generation.

## Scope

**In:** trial model (`trialEndsAt`) + `activateTrial`; prod-guarded start-trial endpoint;
mobile `PurchaseController` + `FakePurchaseController`; paywall CTA wiring + 403→paywall
routing; Email-Plus VPC gate on `createBaby` + mobile consent flow; first-open Demo Story +
5-step entry flow wiring.

**Out (deferred / still cut):** real `react-native-purchases` native SDK, EAS dev build, App
Store Connect IAP, RevenueCat project + sandbox, restore-purchases reconciliation (the EAS
milestone); auto-renew / charge / `past_due` grace; the "Our Whole Family" plan and everything
it sells (voice/video/invited members — cut); credit-ledger persistence + metering (meters
nothing in R1); promo-code machinery; the Stripe/web paywall (app is mobile-only).

## Slices (see issues 168–174)

Three pillars, dependency-ordered. Pillar A (payment) and Pillar B (consent) are independent;
Pillar C (demo/entry flow) composes both.

1. **168** — Subscription **trial model** (`trialEndsAt`) + `SubscriptionService.activateTrial`
   (idempotent, webhook-shaped). *Pillar A root.*
2. **169** — Prod-guarded **`POST /api/billing/start-trial`** endpoint (SEC-2). *Blocked-by 168.*
3. **170** — Mobile **`PurchaseController` + `FakePurchaseController`** (real RN-purchases impl
   documented, not built). *Blocked-by 169.*
4. **171** — Paywall **CTA wiring + 403→paywall routing** (D5, FAIL-1/2, fail-closed). *Blocked-by 170.*
5. **172** — **Email-Plus VPC gate on `createBaby`** (`requireConsentVerified`; SEC-3/4).
   *Pillar B root; independent of A.*
6. **173** — Mobile **Email-Plus consent flow** (attest → send link → confirm → verified
   unlocks photo upload; FAIL-4). *Blocked-by 172.*
7. **174** — First-open **Demo Story + 5-step entry flow** wiring (demo → signup → trial →
   consent → photos; FAIL-5, PERF-4). *Blocked-by 171, 173.*

## Verification

Per-issue `Verification-command`s below. The whole effort is green when `npm run verify` (the
v17 verify gate) plus root + mobile typecheck plus `npx eslint mobile` pass, and the entry
funnel (demo → wall → fake trial → consent → baby) is exercisable on the Simulator against a
seed Household. Real-IAP verification is explicitly **not** part of this gate (EAS milestone).
