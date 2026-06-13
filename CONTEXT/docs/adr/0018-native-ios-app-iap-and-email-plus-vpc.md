# ADR-0018 — Native iOS app: Expo rebuild, Apple IAP billing, and Email-Plus VPC

Status: Accepted (2026-06-12)
Supersedes the mobile posture of [ADR-0003](./0003-web-first-platform.md); amends the
consent mechanism of [ADR-0008](./0008-verifiable-parental-consent.md) for the iOS surface.

## Context

ADR-0003 chose web-first specifically to avoid the App Store's ~30% IAP cut, and
ADR-0008 made the Stripe card transaction double as Verifiable Parental Consent
(VPC) for creating a Baby Persona (biometric data of a minor, COPPA/GDPR). We now
want a native iOS app, testable via TestFlight and submittable to the App Store.

Two facts force a redesign of the mobile billing/consent path:

1. **Apple Guideline 3.1.1** requires a subscription that unlocks in-app digital
   content to use **Apple In-App Purchase**. The Stripe web checkout cannot be
   shipped inside the iOS app, and anti-steering rules forbid pushing users to an
   external web payment for digital goods.
2. **Apple IAP never exposes the cardholder's identity**, so an IAP subscription
   **cannot** serve as VPC. ADR-0008's "payment = consent" mechanism breaks on iOS.

## Decision

- **Platform:** Build the iOS app as a **native Expo / React Native** front-end
  (a true rebuild, not a WebView wrapper), reusing the existing Supabase project,
  Postgres + RLS, Inngest workflows, and Anthropic/fal pipelines. The Next.js app
  remains the **backend + web surface**. The native front-end clears Guideline 4.2
  with native camera, native push, and native navigation.
- **Billing (iOS):** **Apple IAP via RevenueCat.** RevenueCat handles receipt
  validation and emits webhooks that activate the Family's Subscription. The web
  surface keeps Stripe; the two are different rails behind the same subscription
  state.
- **Consent (iOS):** **Email-Plus VPC** (an FTC-approved method), fully decoupled
  from billing. Before a Baby Persona can be created, the Guardian completes an
  email consent flow (consent link → confirm → second confirmation), reusing the
  Resend adapter; the Family is flagged `consent_verified` with a version-stamped
  receipt. IAP handles money; Email-Plus handles identity/consent. This consent
  path is added on **all** surfaces so the consent model is uniform, with the
  Stripe-payment-as-VPC path retained only as a legacy web option.

## Consequences

- iOS subscription revenue pays Apple's commission — an accepted cost of App Store
  presence, scoped to the iOS rail only (web keeps Stripe economics).
- A new non-payment VPC subsystem (email-plus) must exist before Baby Persona
  creation on mobile; the consent engine gains a consent method that is independent
  of an active subscription.
- The backend must accept **Supabase JWT Bearer tokens** (in addition to cookies)
  so the native app can call the same domain services; server-action mutations get
  mirrored as Bearer-authenticated API route handlers.
- Per-jurisdiction consent config (ADR-0015) still governs which VPC method each
  market requires; email-plus becomes one of the configurable methods.
